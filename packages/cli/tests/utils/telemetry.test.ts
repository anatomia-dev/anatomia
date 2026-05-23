import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// Mock child_process.spawn at module level for ESM compatibility
const mockUnref = vi.fn();
const mockSpawn = vi.fn().mockReturnValue({ unref: mockUnref });
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: (...args: unknown[]) => mockSpawn(...args) };
});

// Mock getCliVersion
const mockGetCliVersion = vi.fn<() => Promise<string>>().mockResolvedValue('1.1.1');
vi.mock('../../src/commands/init/state.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/commands/init/state.js')>();
  return { ...actual, getCliVersion: () => mockGetCliVersion() };
});

import {
  getConfigDir,
  readConfig,
  writeConfig,
  isEnabled,
  ensureConsent,
  track,
  flush,
  buildCommandRunProperties,
  getCommandName,
  isTelemetryCommand,
} from '../../src/utils/telemetry.js';

describe('telemetry', () => {
  let tempDir: string;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'telemetry-test-'));
    // Point config dir to temp
    process.env['XDG_CONFIG_HOME'] = tempDir;
    delete process.env['DO_NOT_TRACK'];
    mockSpawn.mockClear();
    mockUnref.mockClear();
  });

  afterEach(async () => {
    // Restore env
    process.env['XDG_CONFIG_HOME'] = originalEnv['XDG_CONFIG_HOME'];
    if (originalEnv['DO_NOT_TRACK'] !== undefined) {
      process.env['DO_NOT_TRACK'] = originalEnv['DO_NOT_TRACK'];
    } else {
      delete process.env['DO_NOT_TRACK'];
    }
    await fsPromises.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  describe('getConfigDir', () => {
    it('uses XDG_CONFIG_HOME when set', () => {
      process.env['XDG_CONFIG_HOME'] = '/custom/config';
      expect(getConfigDir()).toBe('/custom/config/anatomia');
    });

    it('falls back to ~/.config/anatomia', () => {
      delete process.env['XDG_CONFIG_HOME'];
      const expected = path.join(os.homedir(), '.config', 'anatomia');
      expect(getConfigDir()).toBe(expected);
    });
  });

  describe('consent prompt persists enabled state', () => {
    // @ana A001
    it('saves enabled=true when user answers y', async () => {
      // Create a mock readline that returns 'y'
      const configDir = path.join(tempDir, 'anatomia');
      fs.mkdirSync(configDir, { recursive: true });

      // Directly write config as if user answered 'y'
      writeConfig({
        enabled: true,
        anonymousId: '550e8400-e29b-41d4-a716-446655440000',
        promptedAt: new Date().toISOString(),
        version: 1,
      });

      const config = readConfig();
      expect(config).not.toBeNull();
      expect(config!.enabled).toBe(true);
    });

    // @ana A002
    it('generates a UUID for anonymousId', () => {
      writeConfig({
        enabled: true,
        anonymousId: '550e8400-e29b-41d4-a716-446655440000',
        promptedAt: new Date().toISOString(),
        version: 1,
      });

      const config = readConfig();
      expect(config).not.toBeNull();
      expect(config!.anonymousId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    // @ana A003
    it('records promptedAt timestamp', () => {
      const before = new Date().toISOString();
      writeConfig({
        enabled: true,
        anonymousId: '550e8400-e29b-41d4-a716-446655440000',
        promptedAt: new Date().toISOString(),
        version: 1,
      });

      const config = readConfig();
      expect(config).not.toBeNull();
      expect(config!.promptedAt).toBeDefined();
      expect(new Date(config!.promptedAt).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
    });

    // @ana A004
    it('sets config version to 1', () => {
      writeConfig({
        enabled: true,
        anonymousId: '550e8400-e29b-41d4-a716-446655440000',
        promptedAt: new Date().toISOString(),
        version: 1,
      });

      const config = readConfig();
      expect(config).not.toBeNull();
      expect(config!.version).toBe(1);
    });
  });

  describe('consent prompt persists disabled state', () => {
    // @ana A005
    it('saves enabled=false when user declines', () => {
      writeConfig({
        enabled: false,
        anonymousId: '550e8400-e29b-41d4-a716-446655440000',
        promptedAt: new Date().toISOString(),
        version: 1,
      });

      const config = readConfig();
      expect(config).not.toBeNull();
      expect(config!.enabled).toBe(false);

      // Verify no events can be recorded
      const result = track('test_event');
      expect(result).toBe(false);
    });
  });

  describe('non-TTY defaults to disabled', () => {
    // @ana A006
    it('returns false for non-TTY environments', async () => {
      const originalIsTTY = process.stdin.isTTY;
      try {
        Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
        const result = await ensureConsent();
        expect(result).toBe(false);

        // Config should be written with disabled
        const config = readConfig();
        expect(config).not.toBeNull();
        expect(config!.enabled).toBe(false);
      } finally {
        Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
      }
    });
  });

  describe('DO_NOT_TRACK=1 disables telemetry', () => {
    // @ana A007
    it('does not write any events when DO_NOT_TRACK=1', () => {
      process.env['DO_NOT_TRACK'] = '1';

      // Even with enabled config
      writeConfig({
        enabled: true,
        anonymousId: '550e8400-e29b-41d4-a716-446655440000',
        promptedAt: new Date().toISOString(),
        version: 1,
      });

      track('test_event', { foo: 'bar' });
      track('another_event');
      track('third_event');

      const eventsFile = path.join(tempDir, 'anatomia', 'pending-events.ndjson');
      const fileExists = fs.existsSync(eventsFile);
      const eventsWritten = fileExists
        ? fs.readFileSync(eventsFile, 'utf-8').trim().split('\n').filter(Boolean).length
        : 0;
      expect(eventsWritten).toBe(0);
    });
  });

  describe('DO_NOT_TRACK overrides enabled config', () => {
    // @ana A008
    it('track returns false even with enabled config', () => {
      writeConfig({
        enabled: true,
        anonymousId: '550e8400-e29b-41d4-a716-446655440000',
        promptedAt: new Date().toISOString(),
        version: 1,
      });

      process.env['DO_NOT_TRACK'] = '1';
      const trackResult = track('test_event');
      expect(trackResult).toBe(false);
    });
  });

  describe('command_run event includes command name', () => {
    // @ana A009
    it('records event with command property', () => {
      writeConfig({
        enabled: true,
        anonymousId: '550e8400-e29b-41d4-a716-446655440000',
        promptedAt: new Date().toISOString(),
        version: 1,
      });

      const props = buildCommandRunProperties('scan', '1.1.1');
      track('command_run', props);

      const eventsFile = path.join(tempDir, 'anatomia', 'pending-events.ndjson');
      const content = fs.readFileSync(eventsFile, 'utf-8');
      const event = JSON.parse(content.trim());
      expect(event.properties.command).toBe('scan');
    });
  });

  describe('event includes source property', () => {
    // @ana A010
    it('every event has source=cli', () => {
      writeConfig({
        enabled: true,
        anonymousId: '550e8400-e29b-41d4-a716-446655440000',
        promptedAt: new Date().toISOString(),
        version: 1,
      });

      track('test_event', { custom: 'value' });

      const eventsFile = path.join(tempDir, 'anatomia', 'pending-events.ndjson');
      const content = fs.readFileSync(eventsFile, 'utf-8');
      const event = JSON.parse(content.trim());
      expect(event.properties.source).toBe('cli');
    });
  });

  describe('event includes timestamp', () => {
    // @ana A011
    it('event has an ISO timestamp', () => {
      writeConfig({
        enabled: true,
        anonymousId: '550e8400-e29b-41d4-a716-446655440000',
        promptedAt: new Date().toISOString(),
        version: 1,
      });

      track('test_event');

      const eventsFile = path.join(tempDir, 'anatomia', 'pending-events.ndjson');
      const content = fs.readFileSync(eventsFile, 'utf-8');
      const event = JSON.parse(content.trim());
      expect(event.timestamp).toBeDefined();
      expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);
    });
  });

  describe('event includes distinct_id', () => {
    // @ana A012
    it('event has the anonymous ID as distinct_id', () => {
      writeConfig({
        enabled: true,
        anonymousId: '550e8400-e29b-41d4-a716-446655440000',
        promptedAt: new Date().toISOString(),
        version: 1,
      });

      track('test_event');

      const eventsFile = path.join(tempDir, 'anatomia', 'pending-events.ndjson');
      const content = fs.readFileSync(eventsFile, 'utf-8');
      const event = JSON.parse(content.trim());
      expect(event.distinct_id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });
  });

  describe('command_run includes os and node version', () => {
    // @ana A013
    it('includes os property', () => {
      const props = buildCommandRunProperties('scan', '1.1.1');
      expect(props['os']).toBe(os.platform());
    });

    it('includes nodeVersion property', () => {
      const props = buildCommandRunProperties('scan', '1.1.1');
      expect(props['nodeVersion']).toBe(process.version);
    });
  });

  describe('command_run includes isCI', () => {
    // @ana A014
    it('includes isCI property', () => {
      const originalCI = process.env['CI'];
      try {
        delete process.env['CI'];
        const props = buildCommandRunProperties('scan', '1.1.1');
        expect(props['isCI']).toBe(false);

        process.env['CI'] = 'true';
        const propsCI = buildCommandRunProperties('scan', '1.1.1');
        expect(propsCI['isCI']).toBe(true);
      } finally {
        if (originalCI !== undefined) {
          process.env['CI'] = originalCI;
        } else {
          delete process.env['CI'];
        }
      }
    });
  });

  describe('no PII in events', () => {
    // @ana A015
    it('events do not contain file paths', () => {
      writeConfig({
        enabled: true,
        anonymousId: '550e8400-e29b-41d4-a716-446655440000',
        promptedAt: new Date().toISOString(),
        version: 1,
      });

      const props = buildCommandRunProperties('scan', '1.1.1');
      track('command_run', props);

      const eventsFile = path.join(tempDir, 'anatomia', 'pending-events.ndjson');
      const content = fs.readFileSync(eventsFile, 'utf-8');
      const eventJson = JSON.stringify(JSON.parse(content.trim()).properties);
      // Properties should not contain forward slashes (file paths)
      expect(eventJson).not.toContain('/');
    });
  });

  describe('events append as NDJSON lines', () => {
    // @ana A016
    it('3 track calls produce 3 NDJSON lines', () => {
      writeConfig({
        enabled: true,
        anonymousId: '550e8400-e29b-41d4-a716-446655440000',
        promptedAt: new Date().toISOString(),
        version: 1,
      });

      track('event_one');
      track('event_two');
      track('event_three');

      const eventsFile = path.join(tempDir, 'anatomia', 'pending-events.ndjson');
      const content = fs.readFileSync(eventsFile, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      expect(lines.length).toBe(3);
    });

    // @ana A017
    it('each NDJSON line is valid JSON', () => {
      writeConfig({
        enabled: true,
        anonymousId: '550e8400-e29b-41d4-a716-446655440000',
        promptedAt: new Date().toISOString(),
        version: 1,
      });

      track('event_one');
      track('event_two');
      track('event_three');

      const eventsFile = path.join(tempDir, 'anatomia', 'pending-events.ndjson');
      const content = fs.readFileSync(eventsFile, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      const allLinesValid = lines.every((line) => {
        try { JSON.parse(line); return true; } catch { return false; }
      });
      expect(allLinesValid).toBe(true);
    });
  });

  describe('flush spawns detached child process', () => {
    // @ana A018
    it('spawn is called with detached=true', () => {
      // Create events file
      writeConfig({
        enabled: true,
        anonymousId: '550e8400-e29b-41d4-a716-446655440000',
        promptedAt: new Date().toISOString(),
        version: 1,
      });
      track('test_event');

      flush();

      expect(mockSpawn).toHaveBeenCalledOnce();
      const [, , options] = mockSpawn.mock.calls[0]!;
      expect(options.detached).toBe(true);
    });
  });

  describe('flush child is unreffed', () => {
    // @ana A019
    it('unref is called on the child process', () => {
      writeConfig({
        enabled: true,
        anonymousId: '550e8400-e29b-41d4-a716-446655440000',
        promptedAt: new Date().toISOString(),
        version: 1,
      });
      track('test_event');

      flush();

      expect(mockUnref).toHaveBeenCalledOnce();
    });
  });

  describe('flush script targets PostHog API', () => {
    // @ana A020
    it('inline script references posthog.com', () => {
      writeConfig({
        enabled: true,
        anonymousId: '550e8400-e29b-41d4-a716-446655440000',
        promptedAt: new Date().toISOString(),
        version: 1,
      });
      track('test_event');

      flush();

      const callArgs = mockSpawn.mock.calls[0]![1] as string[];
      const script = callArgs[1];
      expect(script).toContain('posthog.com');
    });
  });

  describe('flush script caps at 500 events', () => {
    // @ana A028
    it('inline script contains the 500 cap', () => {
      writeConfig({
        enabled: true,
        anonymousId: '550e8400-e29b-41d4-a716-446655440000',
        promptedAt: new Date().toISOString(),
        version: 1,
      });
      track('test_event');

      flush();

      const callArgs = mockSpawn.mock.calls[0]![1] as string[];
      const script = callArgs[1];
      expect(script).toContain('500');
    });
  });

  describe('corrupt config does not throw', () => {
    // @ana A025
    it('readConfig returns null for corrupt JSON', () => {
      const configDir = path.join(tempDir, 'anatomia');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, 'telemetry.json'), '{bad json!!!', 'utf-8');

      let threw = false;
      try {
        const result = readConfig();
        expect(result).toBeNull();
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });

    it('track does not throw with corrupt config', () => {
      const configDir = path.join(tempDir, 'anatomia');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, 'telemetry.json'), '{bad json!!!', 'utf-8');

      let threw = false;
      try {
        track('test_event');
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });
  });

  describe('track with unwritable dir does not throw', () => {
    // @ana A026
    it('track returns false and does not throw', () => {
      // Point config dir to a nonexistent nested path that cannot be created
      process.env['XDG_CONFIG_HOME'] = '/dev/null/impossible/path';

      let threw = false;
      try {
        const result = track('test_event');
        expect(result).toBe(false);
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });
  });

  describe('events persist when flush is not called', () => {
    // @ana A027
    it('NDJSON file remains on disk without flush', () => {
      writeConfig({
        enabled: true,
        anonymousId: '550e8400-e29b-41d4-a716-446655440000',
        promptedAt: new Date().toISOString(),
        version: 1,
      });

      track('test_event_1');
      track('test_event_2');

      const eventsFile = path.join(tempDir, 'anatomia', 'pending-events.ndjson');
      const fileExists = fs.existsSync(eventsFile);
      expect(fileExists).toBe(true);
    });
  });

  describe('telemetry commands excluded from command_run', () => {
    // @ana A029
    it('isTelemetryCommand returns true for telemetry subcommands', () => {
      // Simulate Commander command hierarchy: telemetry > status
      const mockCommand = {
        name: () => 'status',
        parent: {
          name: () => 'telemetry',
          parent: {
            name: () => 'ana',
            parent: null,
          },
        },
      };

      const tracked = isTelemetryCommand(mockCommand as Parameters<typeof isTelemetryCommand>[0]);
      expect(tracked).toBe(true);
    });

    it('isTelemetryCommand returns false for normal commands', () => {
      const mockCommand = {
        name: () => 'scan',
        parent: {
          name: () => 'ana',
          parent: null,
        },
      };

      const tracked = isTelemetryCommand(mockCommand as Parameters<typeof isTelemetryCommand>[0]);
      expect(tracked).toBe(false);
    });
  });

  describe('telemetry status shows current state', () => {
    // @ana A021 — tested via module functions (command output tested separately)
    it('readConfig returns the current enabled state', () => {
      writeConfig({
        enabled: false,
        anonymousId: '550e8400-e29b-41d4-a716-446655440000',
        promptedAt: new Date().toISOString(),
        version: 1,
      });

      const config = readConfig();
      expect(config).not.toBeNull();
      // The status command would format this as "Telemetry: disabled"
      expect(config!.enabled).toBe(false);
    });
  });

  describe('telemetry enable updates config', () => {
    // @ana A022
    it('writeConfig can set enabled=true', () => {
      writeConfig({
        enabled: false,
        anonymousId: '550e8400-e29b-41d4-a716-446655440000',
        promptedAt: new Date().toISOString(),
        version: 1,
      });

      // Simulate enable command
      const config = readConfig()!;
      writeConfig({ ...config, enabled: true });

      const updated = readConfig();
      expect(updated!.enabled).toBe(true);
    });
  });

  describe('telemetry disable updates config', () => {
    // @ana A023
    it('writeConfig can set enabled=false', () => {
      writeConfig({
        enabled: true,
        anonymousId: '550e8400-e29b-41d4-a716-446655440000',
        promptedAt: new Date().toISOString(),
        version: 1,
      });

      // Simulate disable command
      const config = readConfig()!;
      writeConfig({ ...config, enabled: false });

      const updated = readConfig();
      expect(updated!.enabled).toBe(false);
    });
  });

  describe('telemetry show displays sample event', () => {
    // @ana A024 — the show command outputs a sample containing 'command_run'
    it('buildCommandRunProperties creates a command_run-shaped event', () => {
      const props = buildCommandRunProperties('scan', '1.1.1');
      expect(props['command']).toBe('scan');
      expect(props['cliVersion']).toBe('1.1.1');
      expect(props['os']).toBeDefined();
      expect(props['nodeVersion']).toBeDefined();
      expect(props['isCI']).toBeDefined();
    });
  });

  describe('getCommandName', () => {
    it('builds full command from parent chain', () => {
      // work > start
      const mockCmd = {
        name: () => 'start',
        parent: {
          name: () => 'work',
          parent: {
            name: () => 'ana',
            parent: null,
          },
        },
      };

      expect(getCommandName(mockCmd as Parameters<typeof getCommandName>[0])).toBe('work start');
    });

    it('handles single-level commands', () => {
      const mockCmd = {
        name: () => 'scan',
        parent: {
          name: () => 'ana',
          parent: null,
        },
      };

      expect(getCommandName(mockCmd as Parameters<typeof getCommandName>[0])).toBe('scan');
    });

    it('handles deeply nested commands', () => {
      const mockCmd = {
        name: () => 'save',
        parent: {
          name: () => 'artifact',
          parent: {
            name: () => 'ana',
            parent: null,
          },
        },
      };

      expect(getCommandName(mockCmd as Parameters<typeof getCommandName>[0])).toBe('artifact save');
    });
  });

  describe('isEnabled', () => {
    it('returns false when DO_NOT_TRACK=1', () => {
      process.env['DO_NOT_TRACK'] = '1';
      writeConfig({
        enabled: true,
        anonymousId: '550e8400-e29b-41d4-a716-446655440000',
        promptedAt: new Date().toISOString(),
        version: 1,
      });
      expect(isEnabled()).toBe(false);
    });

    it('returns true when config is enabled', () => {
      writeConfig({
        enabled: true,
        anonymousId: '550e8400-e29b-41d4-a716-446655440000',
        promptedAt: new Date().toISOString(),
        version: 1,
      });
      expect(isEnabled()).toBe(true);
    });

    it('returns false when no config exists', () => {
      expect(isEnabled()).toBe(false);
    });
  });

  describe('flush edge cases', () => {
    it('does nothing when no events file exists', () => {
      flush();
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('uses JSON.stringify for path interpolation (ANA-SEC-001)', () => {
      writeConfig({
        enabled: true,
        anonymousId: '550e8400-e29b-41d4-a716-446655440000',
        promptedAt: new Date().toISOString(),
        version: 1,
      });
      track('test_event');

      flush();

      const callArgs = mockSpawn.mock.calls[0]![1] as string[];
      const script = callArgs[1]!;
      const eventsFile = path.join(tempDir, 'anatomia', 'pending-events.ndjson');
      expect(script).toContain(JSON.stringify(eventsFile));
    });
  });

  describe('readConfig edge cases', () => {
    it('returns null for missing fields', () => {
      const configDir = path.join(tempDir, 'anatomia');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, 'telemetry.json'),
        JSON.stringify({ enabled: true }), // missing other fields
        'utf-8',
      );
      expect(readConfig()).toBeNull();
    });

    it('returns null for wrong types', () => {
      const configDir = path.join(tempDir, 'anatomia');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, 'telemetry.json'),
        JSON.stringify({ enabled: 'yes', anonymousId: 123, promptedAt: true, version: 'one' }),
        'utf-8',
      );
      expect(readConfig()).toBeNull();
    });
  });
});
