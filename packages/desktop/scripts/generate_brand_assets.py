#!/usr/bin/env python3
"""Install approved A5 logo into packages/desktop/build + renderer assets.

Master: docs/plan/ui-samples/logos/logo-a5-lockup-shield.png
Pre-extracted mark/icon/tray: docs/plan/ui-samples/logos/final-from-a5/

Writes packaging icons/tray into build/, and mark + favicons into renderer assets.
Does not overwrite build/issuers/ (bundled issuer badges).
"""
from PIL import Image
import os, shutil, io

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
SRC = os.path.join(ROOT, 'docs/plan/ui-samples/logos/final-from-a5')
OUT = os.path.join(ROOT, 'packages/desktop/build')
RENDER = os.path.join(ROOT, 'packages/desktop/src/renderer/assets')

# Remove stale generated files in build/ (never touch issuers/)
STALE_BUILD = (
    'lockup.png', 'mark.png', 'favicon-32.png', 'favicon.ico',
    'icon-128.png', 'icon-256.png',
)


def save(img, path):
    img.save(path, format='PNG')


def save_bytes(img, path):
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    open(path, 'wb').write(buf.getvalue())


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(RENDER, exist_ok=True)
    for name in STALE_BUILD:
        p = os.path.join(OUT, name)
        if os.path.isfile(p):
            os.remove(p)
    lockup_render = os.path.join(RENDER, 'lockup.png')
    if os.path.isfile(lockup_render):
        os.remove(lockup_render)

    mark = Image.open(os.path.join(SRC, '01-mark-transparent.png')).convert('RGBA')
    icon512 = Image.open(os.path.join(SRC, '02-app-icon-512.png')).convert('RGBA')
    tmpl = Image.open(os.path.join(SRC, '03-tray-template.png')).convert('RGBA')
    col = Image.open(os.path.join(SRC, '04-tray-color.png')).convert('RGBA')

    save(icon512.resize((512, 512), Image.Resampling.LANCZOS), os.path.join(OUT, 'icon.png'))

    icos = [icon512.resize((s, s), Image.Resampling.LANCZOS) for s in (256, 128, 64, 48, 32, 16)]
    icos[0].save(os.path.join(OUT, 'icon.ico'), format='ICO', append_images=icos[1:])

    fav32 = icon512.resize((32, 32), Image.Resampling.LANCZOS)
    fav = [icon512.resize((s, s), Image.Resampling.LANCZOS) for s in (16, 32, 48)]
    fav[0].save(os.path.join(RENDER, 'favicon.ico'), format='ICO', append_images=fav[1:])
    save(fav32, os.path.join(RENDER, 'favicon-32.png'))

    save(tmpl.resize((16, 16), Image.Resampling.LANCZOS), os.path.join(OUT, 'trayTemplate.png'))
    save_bytes(tmpl.resize((32, 32), Image.Resampling.LANCZOS), os.path.join(OUT, 'trayTemplate@2x.png'))
    save(col.resize((32, 32), Image.Resampling.LANCZOS), os.path.join(OUT, 'tray.png'))
    save_bytes(col.resize((64, 64), Image.Resampling.LANCZOS), os.path.join(OUT, 'tray@2x.png'))

    iconset = '/tmp/otpeer-final.iconset'
    shutil.rmtree(iconset, ignore_errors=True)
    os.makedirs(iconset)
    for base, size in [('icon_16x16', 16), ('icon_32x32', 32), ('icon_128x128', 128),
                       ('icon_256x256', 256), ('icon_512x512', 512)]:
        icon512.resize((size, size), Image.Resampling.LANCZOS).save(os.path.join(iconset, f'{base}.png'))
        icon512.resize((size * 2, size * 2), Image.Resampling.LANCZOS).save(os.path.join(iconset, f'{base}@2x.png'))
    os.system(f'iconutil -c icns {iconset} -o "{os.path.join(OUT, "icon.icns")}"')

    save(mark.resize((256, 256), Image.Resampling.LANCZOS), os.path.join(RENDER, 'mark.png'))
    print('installed build:', sorted(f for f in os.listdir(OUT) if f != 'issuers'))
    print('installed renderer assets:', sorted(os.listdir(RENDER)))


if __name__ == '__main__':
    main()
