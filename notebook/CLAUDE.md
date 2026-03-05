# Notebook UI Design Guidelines

## Do not encode important information in color alone

Color coding (border colors, background tints) can be used as a supplementary visual cue, but must never be the sole indicator of important state. Always include explicit text labels for:

- **Exit codes**: When a cell exits with a non-zero code, append a text line like `Exited with code 124 (timeout)` to the output area. The orange border on timeout is supplementary.
- **Errors**: Compiler errors and runtime errors must show the error message text, not just a red border.
- **Execution state**: Running/idle state should be indicated by button changes (Run vs Stop) and text, not just border color.

This ensures information is accessible regardless of color perception and is unambiguous at a glance.
