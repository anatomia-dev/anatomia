/**
 * Python framework detectors in PRIORITY ORDER.
 *
 * First match wins. Web frameworks (FastAPI, Django, Flask) are checked
 * before CLI frameworks (Typer/Click) because a project can be both a
 * web API and a CLI, and the web framework is the more prominent identity.
 *
 * Signature contract: every detector MUST accept
 * `(dependencies: string[], hints: FrameworkHintEntry[])` and return `Detection`.
 */

import type { Detection } from './fastapi.js';
import type { FrameworkHintEntry } from '../../types/census.js';
import { detectFastAPI } from './fastapi.js';
import { detectDjango } from './django.js';
import { detectFlask } from './flask.js';
import { detectPythonCli } from './cli.js';

export type PythonFrameworkDetector = (
  dependencies: string[],
  hints: FrameworkHintEntry[]
) => Detection;

export const PYTHON_FRAMEWORK_DETECTORS: PythonFrameworkDetector[] = [
  detectFastAPI,
  detectDjango,
  detectFlask,
  detectPythonCli,
];
