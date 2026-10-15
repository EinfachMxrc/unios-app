# SPDX-License-Identifier: AGPL-3.0-or-later
"""Check keychain access across different signed binaries using only fixtures.

Interaction is disabled in the probe, so a broken ACL cannot open a password dialog.
"""

import os
import secrets
import subprocess
import sys
from pathlib import Path

import pytest

from scripts.sign_macos_local import prepare_identity, private_path, run, sign

pytestmark = pytest.mark.skipif(sys.platform != "darwin", reason="macOS code identity and keychain")

PROBE = r"""
#include <Security/Security.h>
#include <string.h>
int main(int argc, char **argv) {
    if (argc != 3) return 8;
    SecKeychainSetUserInteractionAllowed(false);
    SecKeychainRef chain = NULL;
    if (SecKeychainOpen(argv[1], &chain) != errSecSuccess) return 9;
    const char *service = "unios-signature-fixture";
    const char *account = "invented-user";
    const char *secret = "invented-test-token"; // pragma: allowlist secret
    OSStatus status;
    if (!strcmp(argv[2], "create")) {
        status = SecKeychainAddGenericPassword(chain, strlen(service), service,
            strlen(account), account, strlen(secret), secret, NULL);
    } else {
        UInt32 length = 0;
        void *value = NULL;
        status = SecKeychainFindGenericPassword(chain, strlen(service), service,
            strlen(account), account, &length, &value, NULL);
        if (status == errSecSuccess) {
            if (length != strlen(secret) || memcmp(value, secret, length)) status = errSecDecode;
            SecKeychainItemFreeContent(NULL, value);
        }
    }
    CFRelease(chain);
    return status == errSecSuccess ? VARIANT - VARIANT : 10;
}
"""


def requirement(binary: Path) -> str:
    result = subprocess.run(["/usr/bin/codesign", "-d", "-r-", str(binary)],
                            capture_output=True, text=True, check=True)
    return next(line.removeprefix("# ") for line in (result.stdout + result.stderr).splitlines()
                if line.removeprefix("# ").startswith("designated =>"))


@pytest.fixture
def signing_keychain(tmp_path):
    print("Creating disposable signing fixture", flush=True)
    signer = prepare_identity(tmp_path / "signer")
    certificate = tmp_path / "fixture-certificate.pem"
    # Hosted runners start without user trust for this newly generated fixture.
    # Trust only its code-signing policy inside the disposable CI machine.
    ci = os.environ.get("GITHUB_ACTIONS") == "true"
    if ci:
        print("Trusting disposable fixture for code signing", flush=True)
        certificate.write_text(run("/usr/bin/security", "find-certificate", "-c", "UniOS Local Builds", "-p", str(signer)), encoding="ascii")
        run("sudo", "-n", "/usr/bin/security", "add-trusted-cert", "-d", "-r", "trustRoot", "-p", "codeSign", "-k", str(signer), str(certificate))
    try:
        print("Signing fixture ready", flush=True)
        yield signer
    finally:
        # The CI trust policy belongs to the disposable runner and expires
        # with its job. Its private signing key is removed below. Removing an
        # admin trust policy through security can require an interactive UI.
        run("/usr/bin/security", "delete-keychain", str(signer))


def test_updated_binary_keeps_keychain_access_but_ad_hoc_replacement_does_not(tmp_path, signing_keychain):
    identity_dir = tmp_path / "signer"
    signer = signing_keychain
    assert prepare_identity(identity_dir) == signer
    identities = run("/usr/bin/security", "find-identity", "-p", "codesigning", str(signer))
    assert "UniOS Local Builds" in identities and "1 valid identities found" in identities, identities
    source, binary = tmp_path / "probe.c", tmp_path / "uniosd"
    source.write_text(PROBE, encoding="utf-8")
    fixture_chain = tmp_path / "fixture.keychain-db"
    run("/usr/bin/security", "create-keychain", "-p", secrets.token_hex(32), str(fixture_chain))
    try:
        run("/usr/bin/clang", "-Wno-deprecated-declarations", "-framework", "Security",
            "-framework", "CoreFoundation", "-DVARIANT=1", str(source), "-o", str(binary))
        print("Signing original fixture", flush=True)
        sign(binary, signer, "app.unios.desktop.service")
        original_requirement = requirement(binary)
        original_bytes = binary.read_bytes()
        run(str(binary), str(fixture_chain), "create")
        run(str(binary), str(fixture_chain), "read")
        run("/usr/bin/clang", "-Wno-deprecated-declarations", "-framework", "Security",
            "-framework", "CoreFoundation", "-DVARIANT=2", "-O2", str(source), "-o", str(binary))
        sign(binary, prepare_identity(identity_dir), "app.unios.desktop.service")
        assert binary.read_bytes() != original_bytes
        assert requirement(binary) == original_requirement
        # Real OS keychain ACL: updated code can still read its item without UI.
        run(str(binary), str(fixture_chain), "read")
        run("/usr/bin/codesign", "--force", "--sign", "-", str(binary))
        assert requirement(binary) != original_requirement
        assert subprocess.run([str(binary), str(fixture_chain), "read"],
                              capture_output=True, check=False).returncode == 10
    finally:
        run("/usr/bin/security", "delete-keychain", str(fixture_chain))



def test_partial_or_nonprivate_identity_is_not_silently_replaced(tmp_path):
    root = tmp_path / "identity"
    root.mkdir(mode=0o700)
    with pytest.raises(RuntimeError, match="nicht automatisch ersetzen"):
        prepare_identity(root)
    password = root / "password"
    password.write_text("invented", encoding="ascii")
    password.chmod(0o600)
    with pytest.raises(FileNotFoundError):
        prepare_identity(root)
    assert password.read_text(encoding="ascii") == "invented"
    password.chmod(0o644)
    with pytest.raises(PermissionError):
        private_path(password)
    link = tmp_path / "link"
    link.symlink_to(root)
    with pytest.raises(PermissionError):
        private_path(link, directory=True)
    assert os.stat(root).st_mode & 0o077 == 0
