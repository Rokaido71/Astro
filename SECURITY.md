# Sécurité

Ne publiez jamais jeton Discord, conversation, fichier de données ou preuve contenant un message privé dans une issue. Pour une vulnérabilité, utiliser le signalement privé GitHub si cette option est activée ; sinon ouvrir une demande de contact minimale sans détail exploitable ni secret. Ne pas supposer l’existence d’une adresse de sécurité non indiquée.

Le jeton est chiffré avec Electron safeStorage, gardé en mémoire dans le processus principal pendant l’usage et jamais renvoyé au renderer. Sous Windows, cette protection ne couvre pas tous les logiciels du même compte utilisateur. Le dossier de données contient du contexte de conversation et des commandes locales : réserver son accès au propriétaire. Aucun compte utilisateur non fiable ne doit partager ce dossier.

Le renderer est isolé et son réseau bloqué par CSP. Le bot ne demande pas Administrateur ; la visibilité des salons privés reste à configurer dans Discord. Les permissions sont contrôlées avant lecture/envoi. Les messages Discord ne sont jamais des instructions d’administration ou une autorisation d’accès aux autres outils de Codex.

Une publication incertaine reste bloquée jusqu’à preuve. L’opérateur peut accepter explicitement une transformation via la récupération documentée ; cette exception est auditée et garde la pause. Ne pas supprimer les journaux pour forcer un nouvel envoi.

Cette préversion n’a pas reçu d’audit de sécurité indépendant. Seule la version courante des sources est maintenue ; les binaires de développement sont non signés. Vérifier le diff des mises à jour et les dépendances avant usage.
