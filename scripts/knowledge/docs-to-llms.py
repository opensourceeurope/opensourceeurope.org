"""Export the docs in src/content/docs/docs/ as an llms.txt pair for opencrane.

opencrane reads the OSE docs as an `llmstxt` source from a local file (see
.opencrane/config.yaml). This script writes that file and its companion index:

  .opencrane/docs-export/open-source-europe/llms-full.txt   every page, in sidebar order
  .opencrane/docs-export/open-source-europe/llms.txt        one "- [Title](URL)" line per page

opencrane matches the pages in llms-full.txt to the index lines by position, so
both files list the pages in the same order: the order of the sidebar in
src/content/settings/docs.yaml. Each page starts with "# Title".

Run it from the repository root before `opencrane fetch`:

  uv run --no-project --with pyyaml==6.0.2 python scripts/knowledge/docs-to-llms.py

The output directory is not committed. `opencrane fetch` copies the files into
.opencrane/llmstxt/open-source-europe/, which is.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import yaml

SITE = "https://opensourceeurope.org"
ROOT = Path("src/content/docs")
SIDEBAR = Path("src/content/settings/docs.yaml")
OUT = Path(".opencrane/docs-export/open-source-europe")

ASIDE_LABELS = {"note": "Note", "tip": "Tip", "caution": "Caution", "danger": "Danger"}


def sidebar_pages(entries: list[dict]) -> list[str]:
    pages: list[str] = []
    for entry in entries:
        if "page" in entry:
            pages.append(entry["page"])
        elif "items" in entry:
            pages.extend(sidebar_pages(entry["items"]))
    return pages


def page_file(slug: str) -> Path:
    for candidate in (f"{slug}.md", f"{slug}.mdx", f"{slug}/index.md", f"{slug}/index.mdx"):
        path = ROOT / candidate
        if path.exists():
            return path
    sys.exit(f"docs-to-llms: no file for sidebar page {slug}")


def split_frontmatter(text: str) -> tuple[dict, str]:
    match = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not match:
        return {}, text
    return yaml.safe_load(match.group(1)) or {}, text[match.end():]


def plain_markdown(body: str) -> str:
    """Turn Starlight-only syntax into plain Markdown that the chunker reads well."""
    # MDX imports and card wrappers carry no text.
    body = re.sub(r"^import .*$\n?", "", body, flags=re.M)
    body = re.sub(r"^[ \t]*</?CardGrid>[ \t]*$", "", body, flags=re.M)

    # A link card becomes a list item with its description.
    def link_card(match: re.Match) -> str:
        attrs = dict(re.findall(r'(\w+)="([^"]*)"', match.group(1)))
        line = f"- [{attrs.get('title', '')}]({attrs.get('href', '')})"
        return line + (f": {attrs['description']}" if attrs.get("description") else "")

    body = re.sub(r"^[ \t]*<LinkCard\s+(.*?)\s*/>[ \t]*$", link_card, body, flags=re.M)

    # A callout becomes a blockquote that starts with its kind.
    def aside(match: re.Match) -> str:
        label = ASIDE_LABELS.get(match.group(1), match.group(1).capitalize())
        lines = match.group(2).strip().split("\n")
        # Keep a label the author already wrote, such as "**Important**:".
        if not lines[0].startswith("**"):
            lines[0] = f"**{label}:** {lines[0]}"
        return "\n".join(f"> {line}" if line.strip() else ">" for line in lines)

    body = re.sub(r"^:::(\w+)\n(.*?)\n:::$", aside, body, flags=re.M | re.S)

    # Images keep their alt text, which says what they show.
    body = re.sub(r"!\[([^\]]*)\]\([^)]*\)", lambda m: f"[Image: {m.group(1)}]", body)

    # Links to docs pages become absolute, so answers cite a working address.
    body = re.sub(r"\]\((/docs/[^)]*)\)", lambda m: f"]({SITE}{m.group(1)})", body)
    return re.sub(r"\n{3,}", "\n\n", body).strip()


def main() -> None:
    settings = yaml.safe_load(SIDEBAR.read_text(encoding="utf-8"))
    pages = sidebar_pages(settings["sidebar"])

    full_parts: list[str] = []
    index_lines: list[str] = []
    for slug in pages:
        data, body = split_frontmatter(page_file(slug).read_text(encoding="utf-8"))
        title = data["title"]
        url = f"{SITE}/{slug}/"
        full_parts.append(f"# {title}\n\n{plain_markdown(body)}\n")
        description = " ".join(str(data.get("description", "")).split())
        index_lines.append(f"- [{title}]({url})" + (f": {description}" if description else ""))

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "llms-full.txt").write_text("\n\n".join(full_parts), encoding="utf-8")
    (OUT / "llms.txt").write_text(
        "# Open Source Europe\n\n## Open Source Europe\n\n" + "\n".join(index_lines) + "\n",
        encoding="utf-8",
    )
    print(f"docs-to-llms: wrote {len(pages)} pages to {OUT}")


if __name__ == "__main__":
    main()
