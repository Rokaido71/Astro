# Architecture

```text
Discord Gateway → coordinateur serveur → relais par salon → codex queue
                                           ↑                  ↓
Discord REST ← preuve + journal ← réponse contrôlée ← tâche existante
```

- `desktop/` : fenêtre Electron, coffre safeStorage, coordinateur Gateway et services de salon.
- `lib/` : contrôle du contexte, tickets, boîte de commandes locale, transport REST et paramètres.
- `ui/` : interface locale sans scripts externes ni accès réseau du renderer.
- `scripts/` : contrôleur, vérification CLI, compilation et inventaire de licences.
- `test/` : données synthétiques, doubles REST/Gateway et UI Electron isolée.

Un serveur configuré, un Gateway, une destination immuable par sous-relais. Découverte de métadonnées avec contrôle des permissions avant exposition ; pas de lecture d’historique dans les salons inconnus à la seule activation. Le premier message humain d’un nouveau salon est conservé. Les salons déjà suivis reprennent leurs repères bornés.

Pause globale, perte serveur et versions d’accès invalident les opérations tardives. GUILD_CREATE au démarrage peut provoquer une relecture bornée, sans effacer les files. Permissions de rôles, overwrites et membre bot sont revérifiées avant lecture/envoi. Le contexte et les journaux des différents salons ne sont jamais fusionnés.

Une intention est persistée avant POST ; nonce stable et `enforce_nonce` complètent le journal local, sans remplacer celui-ci. Identité/canal/ID/nonce sont vérifiés avant mémorisation de l’ID, puis contenu exact et relecture de publication. Aucune reprise aveugle d’un POST incertain. Les catalogues emoji ne conservent pas le champ créateur.

La commande Codex est un adaptateur local expérimental, pas une API OpenAI publique. Aucun appel de modèle n’est effectué pendant le silence. Tous les outils et accès de la tâche Codex doivent être autorisés séparément par son propriétaire ; du texte Discord ne peut pas étendre cette autorisation.
