# Identité officielle Astro

La référence `astro-logo-approved.png` est le visuel approuvé, conservé sans modification. Le nom s’écrit **Astro**, avec un A majuscule, sans point.

- `astro-logo.png` : cadrage du logo complet (1544 × 374), sans redessin ni changement de typographie.
- `astro-icon.png` : symbole seul, centré sur un carré blanc de 640 × 640, sans étirement.
- `astro.ico` : icône Windows avec les tailles 16, 20, 24, 32, 40, 48, 64, 128 et 256 pixels.

Les exports proviennent directement des pixels du visuel approuvé. L’interface affiche les formes blanches sur ses panneaux sombres par inversion CSS ; le fichier de référence reste noir sur blanc. L’icône Windows garde son fond blanc pour rester lisible sur les thèmes clairs et sombres.

Les images de travail sont exclues du dépôt et du paquet Windows. Le build copie explicitement la référence et ces exports finaux, puis vérifie leurs empreintes SHA-256.
