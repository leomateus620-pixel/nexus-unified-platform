"""Fetch the exact upstream CC0 asset inputs; no global Blender installation is modified."""
from pathlib import Path
import hashlib, urllib.request, zipfile
root=Path(__file__).resolve().parents[2]
cache=root/'.cache/lc02';cache.mkdir(parents=True,exist_ok=True)
sources=[
 ('mpfb2.zip','https://codeload.github.com/makehumancommunity/mpfb2/zip/refs/tags/v2.0.17','d08e726c798fdc4eefb02b06b6c4efe37d40b5439777e53cf96dce0e5073297d',cache),
 ('system-assets.zip','https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip','b542127a8e25547c7c29c19f2d1d2adb9a664c80396ecd694095dbc8028a0107',cache/'system-assets')]
for name,url,expected,dest in sources:
    path=cache/name
    if not path.exists(): urllib.request.urlretrieve(url,path)
    digest=hashlib.file_digest(path.open('rb'),'sha256').hexdigest()
    if digest!=expected: raise RuntimeError(f'Upstream archive changed: {name}; expected {expected}, got {digest}')
    with zipfile.ZipFile(path) as archive:
        for entry in archive.infolist():
            target=(dest/entry.filename).resolve()
            if not target.is_relative_to(dest.resolve()): raise RuntimeError('Archive path outside cache')
        archive.extractall(dest)
    print(name,digest)
