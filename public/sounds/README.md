# Custom move sounds (optional)

Drop audio files here to override the built-in synthesized sounds. The app
looks for these names (first match of `.mp3`, `.ogg`, or `.wav` wins):

| File | Plays on |
|---|---|
| `move.mp3` | a normal move |
| `capture.mp3` | a capture |
| `check.mp3` | a check |
| `castle.mp3` | castling |
| `promote.mp3` | a promotion |

Any file you don't provide falls back to the synthesized wooden knock, so you
can override just `check.mp3` if that's all you want to change.

Keep clips short (well under a second) and quiet. Anything you drop in must be
one you have the rights to use — this project ships no proprietary sounds.

Files here are served as static assets; no code changes or rebuild config are
needed beyond the normal `npm run build`.
