# dub-scan.tape — Record `ana scan .` on dub for the README hero GIF.
#
# Requirements:
#   - VHS v0.11.0+ (brew install charmbracelet/tap/vhs)
#   - A full clone of dub (git clone https://github.com/dubinc/dub.git).
#     Shallow clones will NOT populate the Intelligence section (Activity, Hot files).
#   - `ana` CLI built and on PATH
#
# Usage:
#   cd /path/to/dub          # must be a full clone
#   vhs /path/to/anatomia/assets/demo/dub-scan.tape
#
# To re-record after scan format changes, run the command above again.
# The Output path is relative to the tape file location.

Output dub-scan.gif

Set Width 1200
Set Height 1000
Set FontSize 18
Set Theme "Catppuccin Mocha"
Set TypingSpeed 50ms
Set Padding 20

Type "ana scan ."
Enter
Sleep 25s
