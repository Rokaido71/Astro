# Contribuer

Le périmètre public est le bot Discord officiel sous Windows. Aucun pilotage de compte personnel ou extension navigateur n’est inclus.

Avant une proposition, ouvrir une discussion ou une issue avec le comportement attendu et une reproduction sans données privées. Ajouter un test ciblé, exécuter `npm test` et `npm run check`, puis expliquer le résultat et les limites. Ne jamais utiliser de vrai jeton ou serveur dans les tests : les fixtures sont synthétiques et les appels Discord simulés.

Préserver les invariants : permissions vérifiées, destination liée au ticket, files isolées, arrêt global, aucune répétition d’un envoi incertain, absence de secrets dans l’UI et les journaux. Les changements au contrat CLI ou aux dépendances doivent être documentés. Mettre à jour l’inventaire avec `npm run licenses` si le lockfile change.

Ne pas inclure fichiers de données, captures de conversations, avatars, emojis téléchargés, exécutables locaux, chemins personnels ou configuration remplie dans une PR. La CI n’a besoin d’aucun secret. Les contributions à ce dépôt sont proposées sous sa licence MIT.
