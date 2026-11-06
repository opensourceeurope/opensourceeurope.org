"""OpenCrane extensions for the OSE knowledge base.

The `open-source-europe` source reads the Starlight docs in
src/content/docs/docs/ directly (see config.yaml). These preprocessors turn the
Starlight-only syntax into plain Markdown before the `llms` step builds
llms-full.txt, so the chat searches text, not markup. OpenCrane runs them in
order, after it reads the frontmatter and before it handles images and links.
"""

import re
from pathlib import Path

from opencrane import OpenCraneConfig

SITE = "https://opensourceeurope.org"
ASIDE_LABELS = {"note": "Note", "tip": "Tip", "caution": "Caution", "danger": "Danger"}


def mdx_syntax(content: str, file_path: Path, project_name: str) -> str:
    """Drop MDX imports and card wrappers, and turn a link card into a list item."""
    content = re.sub(r"^import .*$\n?", "", content, flags=re.M)
    content = re.sub(r"^[ \t]*</?CardGrid>[ \t]*$", "", content, flags=re.M)

    def link_card(match: re.Match) -> str:
        attrs = dict(re.findall(r'(\w+)="([^"]*)"', match.group(1)))
        line = f"- [{attrs.get('title', '')}]({attrs.get('href', '')})"
        return line + (f": {attrs['description']}" if attrs.get("description") else "")

    return re.sub(r"^[ \t]*<LinkCard\s+(.*?)\s*/>[ \t]*$", link_card, content, flags=re.M)


def starlight_asides(content: str, file_path: Path, project_name: str) -> str:
    """Turn a `:::note` block into a blockquote that starts with its kind."""

    def aside(match: re.Match) -> str:
        label = ASIDE_LABELS.get(match.group(1), match.group(1).capitalize())
        lines = match.group(2).strip().split("\n")
        # Keep a label the author already wrote, such as "**Important**:".
        if not lines[0].startswith("**"):
            lines[0] = f"**{label}:** {lines[0]}"
        return "\n".join(f"> {line}" if line.strip() else ">" for line in lines)

    return re.sub(r"^:::(\w+)\n(.*?)\n:::$", aside, content, flags=re.M | re.S)


def absolute_docs_links(content: str, file_path: Path, project_name: str) -> str:
    """Make links to docs pages absolute, so an answer quotes a working address."""
    content = re.sub(r"\]\((/docs/[^)]*)\)", lambda m: f"]({SITE}{m.group(1)})", content)
    return re.sub(r"\n{3,}", "\n\n", content)


class Config(OpenCraneConfig):
    markdown_preprocessors = [mdx_syntax, starlight_asides, absolute_docs_links]
