# Third-party licenses

MKV Fast Muxer v3 contains or redistributes third-party software. The project's
MIT license applies to the original code in this repository and does not
replace the licenses of third-party components.

## ffmpeg.wasm JavaScript packages

The project currently depends on:

- `@ffmpeg/ffmpeg` 0.12.15 — MIT
- `@ffmpeg/util` 0.12.2 — MIT

Upstream project:
https://github.com/ffmpegwasm/ffmpeg.wasm

Upstream MIT notice:

> MIT License
>
> Copyright (c) 2019 Jerome Wu
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

## @ffmpeg/core

The project currently redistributes:

- `@ffmpeg/core` 0.12.10 — GPL-2.0-or-later

This package provides the single-threaded FFmpeg WebAssembly core
(`ffmpeg-core.js` / `ffmpeg-core.wasm`). Its npm package metadata declares
the package license as `GPL-2.0-or-later`.

Upstream source and license information:
https://github.com/ffmpegwasm/ffmpeg.wasm

FFmpeg itself and libraries compiled into a particular FFmpeg build may carry
additional LGPL/GPL-compatible license obligations. The WebAssembly core keeps
its own upstream licensing; it is not relicensed under this repository's MIT
license.

When redistributing a modified or replacement FFmpeg WebAssembly core, review
the exact build configuration and the corresponding source/license obligations
for that build before distribution.


## JASSUB / libass subtitle preview

The in-browser ASS preview uses:

- `jassub` 2.5.15 — package metadata declares a compound license:
  LGPL-2.1-or-later AND (FTL OR GPL-2.0-or-later) AND MIT AND
  MIT-Modern-Variant AND ISC AND NTP AND Zlib.

Upstream project and complete license information:
https://github.com/ThaUnknown/jassub

JASSUB embeds / uses libass and related rendering dependencies. Their upstream
license terms remain applicable; they are not relicensed under this repository's
MIT license.
