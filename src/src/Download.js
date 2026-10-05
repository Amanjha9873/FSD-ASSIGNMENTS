'use strict';

const path = require('path');
const { EventEmitter } = require('./EventEmitter');

const DownloadEvents = Object.freeze({
  STARTED: 'downloadStarted',     // { url, fileName, size }
  PROGRESS: 'downloadProgress',   // { fileName, percent, bytes }
  COMPLETED: 'downloadCompleted', // { fileName, path, time }
  FAILED: 'downloadFailed',       // { fileName, error }
});

class Download extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.url
   * @param {number} opts.size                 Total size in bytes
   * @param {string} [opts.fileName]           Defaults to the last URL segment
   * @param {string} [opts.destDir]            Where the file "lands"
   * @param {number} [opts.bytesPerSecond]     Simulated network speed
   * @param {number} [opts.tickMs]             How often progress is computed
   * @param {number} [opts.timeoutMs]          Abort if not finished in time
   * @param {number|null} [opts.failAtPercent] Simulate a network drop (demo/testing)
   */
  constructor({
    url,
    size,
    fileName,
    destDir = './downloads',
    bytesPerSecond = 512 * 1024,
    tickMs = 250,
    timeoutMs = 30000,
    failAtPercent = null,
  }) {
    super(Object.values(DownloadEvents));

    if (!url) throw new Error('url is required');
    if (!(size > 0)) throw new Error('size must be a positive number of bytes');

    this.url = url;
    this.size = size;
    this.fileName = fileName || path.basename(new URL(url).pathname) || 'download.bin';
    this.destDir = destDir;
    this.bytesPerSecond = bytesPerSecond;
    this.tickMs = tickMs;
    this.timeoutMs = timeoutMs;
    this.failAtPercent = failAtPercent;

    this.bytes = 0;
    this.state = 'idle'; // idle | running | completed | failed
    this._lastPercent = -1;
    this._startedAt = 0;
    this._tickTimer = null;
    this._timeoutTimer = null;
  }

  /** Attach listeners BEFORE calling start() so you don't miss downloadStarted. */
  start() {
    if (this.state !== 'idle') return this;

    this.state = 'running';
    this._startedAt = Date.now();

    this.emit(DownloadEvents.STARTED, {
      url: this.url,
      fileName: this.fileName,
      size: this.size,
    });

    // setInterval drives progress...
    this._tickTimer = setInterval(() => this._tick(), this.tickMs);

    // ...and setTimeout guards against a download that never finishes.
    this._timeoutTimer = setTimeout(
      () => this._fail(new Error(`Timed out after ${this.timeoutMs} ms`)),
      this.timeoutMs
    );

    return this;
  }

  cancel() {
    this._fail(new Error('Download cancelled by user'));
  }

  _tick() {
    const chunk = Math.round((this.bytesPerSecond * this.tickMs) / 1000);
    this.bytes = Math.min(this.size, this.bytes + chunk);
    const percent = Math.floor((this.bytes / this.size) * 100);

    // Only emit when the whole-number percent changes -> no event spam.
    if (percent !== this._lastPercent) {
      this._lastPercent = percent;
      this.emit(DownloadEvents.PROGRESS, {
        fileName: this.fileName,
        percent,
        bytes: this.bytes,
      });
    }

    if (this.failAtPercent !== null && percent >= this.failAtPercent && this.bytes < this.size) {
      return this._fail(new Error('Connection reset by peer'));
    }

    if (this.bytes >= this.size) this._complete();
  }

  _complete() {
    if (this.state !== 'running') return;
    this._cleanup();
    this.state = 'completed';
    this.emit(DownloadEvents.COMPLETED, {
      fileName: this.fileName,
      path: path.join(this.destDir, this.fileName),
      time: Date.now() - this._startedAt, // total elapsed ms
    });
  }

  _fail(error) {
    if (this.state !== 'running') return;
    this._cleanup();
    this.state = 'failed';
    this.emit(DownloadEvents.FAILED, { fileName: this.fileName, error });
  }

  _cleanup() {
    clearInterval(this._tickTimer);
    clearTimeout(this._timeoutTimer);
    this._tickTimer = this._timeoutTimer = null;
  }
}

module.exports = { Download, DownloadEvents };
