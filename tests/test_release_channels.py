# SPDX-License-Identifier: AGPL-3.0-or-later
"""Draft release policy rejects unsafe channels and unproven schema compatibility."""

import pytest

from scripts.stage_desktop_release import read_signature, release_policy


@pytest.mark.parametrize('channel', ['stable', 'beta', 'nightly'])
def test_channel_policy_defaults_only_to_actual_schema(channel):
    policy = release_policy('0.1.19', channel, '0.1.0', 'abcdef123456', [])
    assert policy['compatible_schemas'] == ['abcdef123456']
    assert policy['channel'] == channel


@pytest.mark.parametrize('version,channel,minimum,schemas', [
    ('0.1.19', 'foreign', '0.1.0', []),
    ('0.1.19-beta.1', 'stable', '0.1.0', []),
    ('0.1.19', 'beta', '0.1.20', []),
    ('0.1.19', 'beta', 'garbage', []),
    ('garbage', 'beta', '0.1.0', []),
    ('0.1.19', 'beta', '0.1.0', ['ffffffffffff']),
    ('0.1.19', 'beta', '0.1.0', ['abcdef123456', '../private']),
    ('0.1.19', 'beta', '0.1.0', ['abcdef123456', *[f'{n:012x}' for n in range(101)]]),
], ids=['channel', 'stable-prerelease', 'minimum', 'invalid-minimum', 'version',
         'missing-head', 'invalid-schema', 'too-many-schemas'])
def test_invalid_policy_is_rejected(version, channel, minimum, schemas):
    with pytest.raises(ValueError):
        release_policy(version, channel, minimum, 'abcdef123456', schemas)


def test_declared_compatibility_deduplicated_without_implied_ancestors():
    policy = release_policy('0.1.19-beta.1', 'beta', '0.1.0', 'abcdef123456',
                            ['abcdef123456', 'fedcba654321', 'fedcba654321'])
    assert policy['compatible_schemas'] == ['abcdef123456', 'fedcba654321']


@pytest.mark.parametrize('payload', [b'', b'   ', b'x' * 16385, b'\xff'],
                         ids=['empty', 'whitespace', 'oversized', 'invalid-encoding'])
def test_signature_metadata_bounded(tmp_path, payload):
    signature = tmp_path / 'fixture.sig'
    signature.write_bytes(payload)
    with pytest.raises(ValueError):
        read_signature(signature)


def test_signature_fixture_only_staging_not_authenticity_claim(tmp_path):
    signature = tmp_path / 'fixture.sig'
    signature.write_text('fictional-signature\n', encoding='utf-8')
    assert read_signature(signature) == 'fictional-signature'
