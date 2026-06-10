---
name: pdf-tiles
description: Read a PDF crisply by slicing it into screen-sized PNG strips. Use whenever the user shares a PDF — especially a tall design mockup, layout spec, or anything with fine text/measurements — because viewing a whole page at once downscales it and blurs detail.
---

# Reading PDFs crisply (pdf-tiles)

When Claude views a PDF page (or any image) it is downscaled to a fixed
resolution budget (~1500px on the long edge). A tall page — e.g. a 1920×8000
design mockup of a scrolling page — is therefore crushed several times over and
small text / pixel spacing blur. **Don't read a tall PDF page directly.** Slice
it first.

## How

The bundled script renders the PDF into a column of PNG **strips**, each ~the
display width, so each one is shown at (near) full resolution:

```sh
sh .claude/skills/pdf-tiles/tile.sh <file.pdf> [width=1500] [strip_height=900] [out_dir=pdf-tiles]
```

Then **Read the strips in order** (`pdf-tiles/tile_00.png`, `tile_01.png`, …);
`pdf-tiles/tiles.txt` lists each strip with the y-range it covers. Strips overlap
slightly so nothing is bisected at a boundary. Multi-page PDFs are handled too
(every page is tiled).

Requires poppler (`pdftoppm`, `pdfinfo`) — already installed on this machine.

## Tips

- The default `width=1500` keeps strips at/under the budget so they aren't
  downscaled. Only raise it if the source genuinely has finer detail you need.
- Annotated numbers (px gaps, hex colours, font sizes) in the mockup still read
  more reliably as text callouts than measuring off the image — but with tiling
  you *can* now read fine print.
- The `pdf-tiles/` output dir is scratch; delete it when done (or git-ignore it).
