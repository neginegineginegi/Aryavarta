# Fonts for social cards

`ImageResponse` (Satori) cannot read the faces `next/font` loads: it needs a
TTF, OTF or WOFF it can be handed as bytes, and `next/font` emits WOFF2 into
the build output with no stable path. So the two faces the cards use are
committed here as files.

Both are subsets, because `ImageResponse` has a hard 500KB bundle limit that
counts fonts, JSX, CSS and images together.

| File | Source | Subset to | Size |
| --- | --- | --- | --- |
| `tiro-devanagari-wordmark.ttf` | Tiro Devanagari Hindi 400 | the 7 codepoints of अभिलेखः: U+0905 U+092D U+093F U+0932 U+0947 U+0916 U+0903 | 2.6KB |
| `newsreader-latin.ttf` | Newsreader 300 | Basic Latin, Latin-1 Supplement, common punctuation, ₹ | 44.7KB |

Regenerate with:

```
pyftsubset tiro.ttf --output-file=tiro-devanagari-wordmark.ttf \
  --text="अभिलेखः" --layout-features='*' --no-hinting --desubroutinize

pyftsubset newsreader-300.ttf --output-file=newsreader-latin.ttf \
  --unicodes="U+0020-007E,U+00A0-00FF,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2022,U+00B7,U+20B9" \
  --layout-features='*' --no-hinting
```

`--layout-features='*'` is not optional for the Devanagari subset. Devanagari
needs GSUB and GPOS to place the matra and the conjunct; drop the layout
features and the seven glyphs render in sequence as nonsense rather than as a
word.

Both faces are SIL Open Font License 1.1. The full licence text for each sits
beside it, as the licence requires.
