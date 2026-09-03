#!/usr/bin/env python3
"""在隔离 Python 进程中加载有界 PyYAML 缓存并运行外部 validator。"""

from __future__ import annotations

import json
import runpy
import sys
from pathlib import Path


def configure_paths(cache_root: str, validator_path: str | None = None) -> None:
    cache = Path(cache_root).resolve()
    if not cache.is_dir():
        raise RuntimeError("PyYAML cache is unavailable")
    sys.path.insert(0, str(cache))
    if validator_path is not None:
        validator_parent = Path(validator_path).resolve().parent
        sys.path.insert(1, str(validator_parent))


def inspect_yaml(cache_root: str) -> None:
    configure_paths(cache_root)
    import yaml  # pylint: disable=import-outside-toplevel

    print(json.dumps({"version": str(yaml.__version__)}, ensure_ascii=False))


def run_validator(cache_root: str, validator_path: str, target_path: str) -> None:
    validator = Path(validator_path).resolve()
    if not validator.is_file():
        raise RuntimeError("Validator is unavailable")
    configure_paths(cache_root, str(validator))
    sys.argv = [str(validator), str(Path(target_path).resolve())]
    runpy.run_path(str(validator), run_name="__main__")


def main() -> None:
    args = sys.argv[1:]
    if len(args) == 2 and args[0] == "--inspect":
        inspect_yaml(args[1])
        return
    if len(args) == 4 and args[0] == "--run":
        run_validator(args[1], args[2], args[3])
        return
    raise RuntimeError("Invalid launcher arguments")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # 入口必须把启动错误交还给 Node 包装层分类。
        print(str(error), file=sys.stderr)
        raise SystemExit(2) from error
