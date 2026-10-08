"""Read-only byte audit of the original delivery archives, not the editable website.

Run: python scripts/verify-delivery.py
The historic 03/04/05 registers are package-specific and must not be compared
with the integrated tree or with each other.
"""
import hashlib
import json
import pathlib
import re
import zipfile

ARCHIVES = pathlib.Path(__file__).resolve().parents[2] / 'Uebergabe' / 'statische-originalpakete'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def members(z, prefix):
    names = set(z.namelist())
    assert len(names) == len(z.namelist()), 'duplicate ZIP member'
    assert all(n.startswith(prefix) and not n.endswith('/') and '..' not in pathlib.PurePosixPath(n).parts for n in names), 'unexpected ZIP path'
    return names


def release(name, root):
    with zipfile.ZipFile(ARCHIVES / name) as z:
        prefix = root + '/'
        names = members(z, prefix)
        manifest_name = prefix + 'RELEASE_SHA256.json'
        manifest = json.loads(z.read(manifest_name))['files']
        assert set(manifest) == {n[len(prefix):] for n in names - {manifest_name}}, 'release manifest inventory mismatch'
        for rel, expected in manifest.items():
            data = z.read(prefix + rel)
            assert len(data) == expected['bytes'] and sha(data) == expected['sha256'], rel
        return len(manifest)


def sums(name, root):
    with zipfile.ZipFile(ARCHIVES / name) as z:
        prefix = root + '/'
        names = members(z, prefix)
        manifest_name = prefix + 'SHA256SUMS'
        lines = z.read(manifest_name).decode('utf-8').splitlines()
        listed = set()
        for line in lines:
            match = re.fullmatch(r'([a-f0-9]{64})  (.+)', line)
            assert match, 'invalid SHA256SUMS line'
            digest, rel = match.groups()
            assert rel not in listed and not rel.startswith('/') and '..' not in pathlib.PurePosixPath(rel).parts, rel
            listed.add(rel)
            assert prefix + rel in names and sha(z.read(prefix + rel)) == digest, rel
        assert listed == {n[len(prefix):] for n in names - {manifest_name}}, 'SHA256SUMS inventory mismatch'
        return len(listed)


def main():
    result = {
        'Gesamtpaket_final': release('EXOBASIS_Static_Gesamtpaket_final.zip', 'EXOBASIS_Static_Gesamtpaket'),
        'Paket_03': release('EXOBASIS_Static_Paket_03.zip', 'EXOBASIS_Static_Paket_03'),
        'Paket_04': sums('EXOBASIS_Static_Paket_04.zip', 'EXOBASIS_Static_Paket_04'),
        'Paket_05': sums('EXOBASIS_Static_Paket_05.zip', 'EXOBASIS_Static_Paket_05'),
    }
    print(json.dumps(result, sort_keys=True))
    return result


if __name__ == '__main__':
    main()
