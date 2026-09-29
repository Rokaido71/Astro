# Identité officielle Astro

La référence `astro-logo-approved.png` est le visuel approuvé, conservé sans modification. Le nom s’écrit **Astro**, avec un A majuscule, sans point.

- `astro-logo.png` : cadrage du logo complet (1544 × 374), sans redessin ni changement de typographie.
- `astro-icon.png` : symbole seul, centré sur un carré blanc de 640 × 640, sans étirement.
- `astro-taskbar-white.png` : symbole blanc transparent, carré de 1024 pixels, marge latérale de 2,5 %, proportions conservées.
- `astro.ico` : icône Windows blanche transparente avec les tailles 16, 20, 24, 32, 40, 48, 64, 128 et 256 pixels.

Les exports proviennent directement des pixels du visuel approuvé. L’interface affiche les formes blanches sur ses panneaux sombres par inversion CSS ; le fichier de référence reste noir sur blanc. L’icône Windows est blanche et transparente, optimisée pour une barre des tâches sombre. `astro-icon.png` reste inchangé pour les images de l’interface utilisant l’inversion CSS.

Les images de travail sont exclues du dépôt et du paquet Windows. Le build copie explicitement la référence et ces exports finaux, puis vérifie leurs empreintes SHA-256.

Régénération optionnelle : `python scripts/export-taskbar-icon.py` (Python 3 et Pillow). Le script vérifie l’empreinte de la référence approuvée, isole ses trois formes, extrait l’alpha et exporte les neuf tailles Windows. Ces outils ne sont pas nécessaires au fonctionnement de l’application ni à sa compilation habituelle.
