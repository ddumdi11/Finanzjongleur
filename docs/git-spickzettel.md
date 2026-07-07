# Spickzettel

Vor git pull: git status -sb lesen – und nur pullen, wenn keine lokalen Commits und keine lokalen Änderungen da sind.

git status -sb
ahead?  → stop
M / ??  → stop
sonst   → pull

## Checkout/Pull blockiert: "local changes would be overwritten"

### Situation

Du willst Branch wechseln oder pullen, aber Git blockiert wegen uncommitteter Änderungen.

### A) Änderungen behalten (empfohlen): Stash-Workflow

```bash
git status
git stash push -u -m "wip: before checkout/pull"
git checkout main
git pull
git stash pop
git status
```

Hinweise:
-u stasht auch untracked files.
Wenn stash pop Konflikte erzeugt: auflösen, dann git add ... und weiter.

Einzelne Datei verwerfen:

```bash
git restore <pfad/zur/datei>
```

Alles verwerfen (hart!):

```bash
git reset --hard
git clean -fd
git status
```

Vorlage ursprünglich aus: dev-tools/git/pr-status
