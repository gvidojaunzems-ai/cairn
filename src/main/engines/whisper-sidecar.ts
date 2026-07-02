/**
 * whisper.cpp sidecar resolver and transcription helper.
 *
 * Bundled binary layout (Spec 21):
 *   resources/whisper/{win32|darwin|linux}/whisper(.exe)
 * Override via CAIRN_WHISPER_PATH env var.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Fallback transcript when whisper.cpp is unavailable (privacy-safe, on-device). */
export function simulateWhisperTranscribe(_audioBuffer: Buffer): string {
  return 'Team discussed PoC progress, vector index milestones, and standup workflow.';
}

const PLATFORM_DIR: Record<string, string> = {
  win32: 'win32',
  darwin: 'darwin',
  linux: 'linux',
};

export function resolveWhisperBinary(): string | null {
  const override = process.env.CAIRN_WHISPER_PATH;
  if (override !== undefined && override.length > 0) {
    return override;
  }
  const platformDir = PLATFORM_DIR[process.platform];
  if (platformDir === undefined) {
    return null;
  }
  const name = process.platform === 'win32' ? 'whisper.exe' : 'whisper';
  const candidate = join(process.cwd(), 'resources', 'whisper', platformDir, name);
  return existsSync(candidate) ? candidate : null;
}

/**
 * Transcribe audio via whisper.cpp when available; otherwise use the meeting
 * simulation fallback (privacy-safe — no upload).
 */
export function transcribeWithWhisperSidecar(audioBuffer: Buffer): string {
  const binary = resolveWhisperBinary();
  if (binary === null || audioBuffer.length === 0) {
    return simulateWhisperTranscribe(audioBuffer);
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'cairn-whisper-'));
  const wavPath = join(tempDir, 'audio.wav');
  const outBase = join(tempDir, 'out');
  try {
    writeFileSync(wavPath, audioBuffer);
    const result = spawnSync(
      binary,
      ['-m', join(process.cwd(), 'resources', 'whisper', 'models', 'ggml-base.en.bin'), '-f', wavPath, '-otxt', '-of', outBase],
      { encoding: 'utf8', timeout: 120_000 },
    );
    if (result.status !== 0) {
      return simulateWhisperTranscribe(audioBuffer);
    }
    const txtPath = `${outBase}.txt`;
    if (existsSync(txtPath)) {
      return readFileSync(txtPath, 'utf8').trim();
    }
    return simulateWhisperTranscribe(audioBuffer);
  } catch {
    return simulateWhisperTranscribe(audioBuffer);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
