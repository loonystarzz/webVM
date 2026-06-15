"use strict";

import * as Messages from './spicemsg.js';
import { Constants } from './enums.js';
import { SpiceConn } from './spiceconn.js';

/*----------------------------------------------------------------------------
**  SpicePlaybackConn — custom audio path
**
**  Uses WebCodecs AudioDecoder + Web Audio API instead of MediaSource.
**  Receives raw Opus packets from SPICE, decodes them, and schedules them
**  on an AudioContext for gapless playback.
**--------------------------------------------------------------------------*/

function SpicePlaybackConn()
{
    SpiceConn.apply(this, arguments);
}

SpicePlaybackConn.prototype = Object.create(SpiceConn.prototype);

SpicePlaybackConn.prototype.process_channel_message = function(msg)
{
    if (msg.type == Constants.SPICE_MSG_PLAYBACK_START)
    {
        var start = new Messages.SpiceMsgPlaybackStart(msg.data);
        console.log('[audio] PLAYBACK_START freq=' + start.frequency + ' ch=' + start.channels);
        this._audio_start(start.frequency, start.channels);
        return true;
    }

    if (msg.type == Constants.SPICE_MSG_PLAYBACK_DATA)
    {
        var data = new Messages.SpiceMsgPlaybackData(msg.data);
        if (!this._ctx) this._audio_start(48000, 2);
        this._audio_push(data.data);
        return true;
    }

    if (msg.type == Constants.SPICE_MSG_PLAYBACK_STOP)
    {
        console.log('[audio] PLAYBACK_STOP');
        this._audio_stop();
        return true;
    }

    if (msg.type == Constants.SPICE_MSG_PLAYBACK_MODE ||
        msg.type == Constants.SPICE_MSG_PLAYBACK_VOLUME ||
        msg.type == Constants.SPICE_MSG_PLAYBACK_MUTE ||
        msg.type == Constants.SPICE_MSG_PLAYBACK_LATENCY)
    {
        return true;
    }

    return false;
};

SpicePlaybackConn.prototype._audio_start = function(sampleRate, channels)
{
    if (this._ctx) return;

    try {
        this._ctx       = new AudioContext({ sampleRate: sampleRate || 48000 });
        this._channels  = channels || 2;
        this._next_time = 0;
        this._started   = false;

        var self = this;

        if (typeof AudioDecoder !== 'undefined') {
            /* ── WebCodecs path ─────────────────────────── */
            console.log('[audio] using WebCodecs path');
            this._decoder = new AudioDecoder({
                output: function(audioData) { self._on_decoded(audioData); },
                error:  function(e)         { console.error('[audio] decoder error', e); }
            });
            this._decoder.configure({
                codec:            'opus',
                sampleRate:       sampleRate || 48000,
                numberOfChannels: channels   || 2,
            });
        } else {
            /* ── ScriptProcessor fallback (MediaSource-free) */
            console.warn('[audio] WebCodecs not available; trying MediaSource fallback');
            this._use_media_source();
        }

        /* resume suspended context on first user gesture */
        if (this._ctx.state === 'suspended') {
            var resume = function() {
                self._ctx && self._ctx.resume();
                document.removeEventListener('click',   resume);
                document.removeEventListener('keydown', resume);
            };
            document.addEventListener('click',   resume);
            document.addEventListener('keydown', resume);
        }

        console.log('[audio] AudioContext state=' + this._ctx.state + ' sr=' + this._ctx.sampleRate);
    } catch(e) {
        console.error('[audio] _audio_start failed', e);
    }
};

SpicePlaybackConn.prototype._on_decoded = function(audioData)
{
    try {
        var ctx      = this._ctx;
        var nch      = audioData.numberOfChannels;
        var nframes  = audioData.numberOfFrames;
        var sr       = audioData.sampleRate;

        var buf = ctx.createBuffer(nch, nframes, sr);
        for (var c = 0; c < nch; c++) {
            var ch = new Float32Array(nframes);
            /* must specify f32-planar or copyTo copies interleaved (2× size) */
            audioData.copyTo(ch, { planeIndex: c, format: 'f32-planar' });
            buf.copyToChannel(ch, c);
        }
        audioData.close();

        var src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);

        var now = ctx.currentTime;
        if (!this._started || this._next_time < now + 0.02) {
            this._next_time = now + 0.05;   /* 50 ms initial buffer */
            this._started = true;
        }
        src.start(this._next_time);
        this._next_time += buf.duration;
    } catch(e) {
        console.error('[audio] _on_decoded error', e);
    }
};

SpicePlaybackConn.prototype._audio_push = function(opusData)
{
    if (!this._ctx) return;

    /* resume suspended context — by the time SPICE sends audio the user
       has already interacted with the page (clicked into the VM), so
       resume() will succeed without needing a fresh gesture */
    if (this._ctx.state === 'suspended') {
        this._ctx.resume().then(function() {
            console.log('[audio] AudioContext resumed');
        }).catch(function(e) {
            console.warn('[audio] resume failed', e);
        });
    }

    if (this._decoder && this._decoder.state === 'configured') {
        try {
            this._decoder.decode(new EncodedAudioChunk({
                type:      'key',
                timestamp: Math.round(this._ctx.currentTime * 1e6),
                data:      opusData,
            }));
        } catch(e) {
            console.error('[audio] decode error', e);
        }
    }
};

SpicePlaybackConn.prototype._audio_stop = function()
{
    if (this._decoder) {
        try { this._decoder.close(); } catch(e) {}
        this._decoder = null;
    }
    if (this._ctx) {
        try { this._ctx.close(); } catch(e) {}
        this._ctx = null;
    }
    this._started   = false;
    this._next_time = 0;
};

/* MediaSource fallback — kept minimal, only used if WebCodecs unavailable */
SpicePlaybackConn.prototype._use_media_source = function()
{
    console.warn('[audio] MediaSource fallback not fully implemented');
};

export { SpicePlaybackConn };
