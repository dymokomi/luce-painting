#!/usr/bin/env python3
"""luce-painting's gate: every module's tests, native and through the C backend.
GPU tests skip themselves where no device opens (CI runners)."""
import argparse, os, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODULES = ['mixing', 'dynamics', 'brush_images', 'brush_mask', 'heal', 'stroke', 'brush_tests', 'warp']


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', type=Path, default=Path(os.environ.get('LUCE_BASE_COMPILER', ROOT.parent / 'luce-base/build/luce-base')))
    parser.add_argument('--backend', choices=['native', 'c', 'both'], default='both')
    args = parser.parse_args()
    (ROOT / 'build').mkdir(exist_ok=True)
    env = dict(os.environ, LUCE_STD=str(ROOT.parent / 'luce-base/src/std'), LUCE_CACHE=str(ROOT / 'build/cache'))
    backends = {'native': ['--native'], 'c': ['--backend=c'], 'both': ['--native', '--backend=c']}[args.backend]
    for backend in backends:
        for module in MODULES:
            print(f'TEST {module} {backend}', flush=True)
            # A module is a file, or a directory of files listed in its ORDER.
            target = ROOT / f'src/{module}'
            target = target if target.is_dir() else target.with_suffix('.lucb')
            subprocess.run([str(args.base.resolve()), 'test', str(target), backend], check=True, cwd=ROOT, env=env, timeout=900)
    print('PASS luce-painting', flush=True)


if __name__ == '__main__':
    main()
