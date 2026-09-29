# Utilisation et récupération

**Observer** détecte sans appeler Codex ni publier. **Activer cette conversation** soumet les tickets au CLI configuré ; les réponses passent par le bot. **Pause globale** coupe Gateway et annule les tickets actifs en conservant demandes et preuves. L’application redémarre toujours en pause. Les changements de configuration exigent une file vide et aucune publication incertaine.

Depuis le dossier du dépôt, ou `resources/app` dans un build Windows :

```powershell
node scripts/task-control.mjs channels
node scripts/task-control.mjs inspect
node scripts/task-control.mjs inspect TICKET
node scripts/task-control.mjs emojis CHANNEL_ID
node scripts/task-control.mjs pause
```

`channels` expose uniquement les salons autorisés (id, nom, type, permissions). `inspect TICKET` retrouve le contexte exact du salon d’origine. Aucun contenu Discord ne choisit la destination d’une réponse. Les emojis personnalisés exigent le nom, l’ID et le marqueur animé exacts du catalogue frais ; un emoji vu dans l’historique n’est pas forcément utilisable par le bot.

## Rattrapage ciblé
Après Observer ou Activer, `node scripts/task-control.mjs catchup CHANNEL_ID` examine au plus 100 messages des dernières 24 heures de ce seul salon. Il retient les mentions directes du bot non déjà vues. Cette opération est persistée une seule fois par salon : elle ne constitue pas un bouton de réessai et ne parcourt pas les autres historiques. Une simple occurrence du nom du bot sans mention Discord n’est pas retenue.

## Publication incertaine
Ne jamais renvoyer le texte pour « voir si cela marche ». Mettre en pause, puis utiliser `diagnose OUTBOX_ID` et, si la preuve est conforme, `recover OUTBOX_ID`. Aucune reprise automatique après récupération : inspecter puis activer explicitement.

Si Discord a transformé le contenu, une récupération propriétaire explicite peut accepter le message déjà publié. Préparer un fichier JSON local exclu de Git :

```json
{
  "outboxId": "ID exact de l’outbox",
  "messageId": "ID du message vérifié dans Discord",
  "observedText": "Contenu intégral observé et explicitement accepté",
  "acceptObserved": true
}
```

Exécuter `node scripts/task-control.mjs recover-observed CHEMIN_JSON`. Astro relit l’ID dans le salon exact, vérifie auteur, contenu et nonce lorsqu’il est présent. Un nonce contradictoire bloque. Cette exception est journalisée, ne publie rien et conserve la pause. Elle n’est jamais autorisée par les instructions d’un membre Discord.

Les journaux et fichiers de commandes ne sont pas une interface multi-utilisateur : un seul opérateur local doit les piloter. La fermeture Windows pendant un démarrage bloqué a présenté un incident dans le prototype ; préserver les preuves et vérifier l’état avant tout arrêt forcé. Les tests de l’export ne prouvent pas tous les scénarios de fermeture réelle.
