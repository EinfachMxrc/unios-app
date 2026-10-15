# SPDX-License-Identifier: AGPL-3.0-or-later

import pytest

from app.config import implicit_institution_slug
from app.institutions import load_institution


def test_coburg_profile_has_only_confirmed_addresses():
    profile = load_institution("hs-coburg")
    assert profile.name == "Hochschule Coburg"
    assert str(profile.moodle_url) == "https://moodle.hs-coburg.de/"
    assert str(profile.primuss.base_url) == "https://www3.primuss.de/"
    assert str(profile.mycampus.base_url) == "https://mycampus.hs-coburg.de/"
    assert str(profile.primuss.login_start_url).startswith("https://www3.primuss.de/cgi-bin/login/")
    assert profile.primuss.institution_code is None
    assert all(value is None for value in profile.primuss.selectors.values())


def test_profile_name_cannot_escape_package():
    with pytest.raises(ValueError, match="Ungültiger"):
        load_institution("../private")


def test_new_installer_marker_keeps_generic_profile_after_database_creation(tmp_path):
    (tmp_path / "uni_os.sqlite3").touch()
    marker = tmp_path / "setup.json"
    marker.write_text('{"version":1,"institution":null,"notifications":null,"completed":false}',
                      encoding="utf-8")
    assert implicit_institution_slug(tmp_path) == "generic"
    marker.write_text('{"version":1,"institution":"generic","completed":true}', encoding="utf-8")
    assert implicit_institution_slug(tmp_path) == "generic"
    marker.write_text('{"version":1,"institution":"hs-coburg","completed":true}', encoding="utf-8")
    assert implicit_institution_slug(tmp_path) == "hs-coburg"
    marker.unlink()
    assert implicit_institution_slug(tmp_path) == "hs-coburg"
