# Préparer une publication

La licence du projet est MIT. Cette liste est un aide-mémoire public pour les mainteneurs.

1. Vérifier que serveur, conversation et chemin CLI ne sont jamais préconfigurés dans les sources.
2. Exclure données, secrets, journaux, conversations, captures et assets tiers sans autorisation.
3. Exécuter tests, contrôle syntaxique, audit public et inventaire des licences.
4. Construire un dossier Windows neuf, contrôler les empreintes et conserver les notices tierces.
5. Relire les changements, puis publier uniquement après validation du mainteneur. Une exécution locale ne prouve pas la réussite de la CI distante.
6. Les builds de développement ne sont pas signés ; ne pas annoncer de téléchargement ou de release inexistant.
