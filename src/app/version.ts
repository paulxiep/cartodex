// Single source of truth for the app version and the changelog text: the changelog file
// itself. The badge shows the latest version parsed from it, and the changelog page renders the
// same content, so the number and the notes it links to can never drift.
import changelogMd from '../../CHANGELOG.md?raw'

export const CHANGELOG_MD = changelogMd
export const VERSION = /##\s*\[(\d+\.\d+\.\d+)\]/.exec(changelogMd)?.[1] ?? '0.0.0'
