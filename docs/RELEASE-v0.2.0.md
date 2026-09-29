# Astro v0.2.0 — première release portable

Application locale Windows x64 reliant un bot Discord officiel à une conversation Codex existante. Cette version propose le suivi séparé des salons autorisés, les modes Observer/Activer/Pause, un jeton chiffré localement et le logo Astro avec une icône Windows blanche transparente.

## Télécharger et installer

- Télécharger `Astro-v0.2.0-windows-x64.zip` et `SHA256SUMS` depuis cette release.
- Vérifier le SHA-256 du ZIP avec `Get-FileHash .\Astro-v0.2.0-windows-x64.zip -Algorithm SHA256`.
- **Extraire tout le ZIP**, puis lancer `Astro-win32-x64/Astro.exe`. Conserver toutes les ressources et notices avec l’exécutable.
- Le programme est **non signé**, sans installateur ni mise à jour automatique. Windows peut demander de confirmer sa provenance. Ne pas désactiver les protections du système.

## Configurer

Créer votre propre bot Discord et activer Message Content Intent. Autoriser uniquement les salons souhaités, sans permission Administrateur. Dans les Réglages de l’application, renseigner votre serveur, l’identifiant de votre conversation Codex existante et le jeton du bot. **Saisir le jeton uniquement dans l’application locale** ; aucune destination ni aucun secret n’est préconfiguré.

Installer Node.js 22.12+ pour le contrôleur et les diagnostics. Depuis `Astro-win32-x64/resources/app`, lancer `node scripts/doctor.mjs`, puis donner à votre conversation Codex le chemin du `TASK-BRIDGE.md` et vos autorisations explicites. Commencer par Observer avant Activer. Les données restent dans `%APPDATA%\Astro` et le démarrage se fait en pause.

## Limites

Le PC doit rester allumé et éveillé, connecté à Internet, avec Astro et Codex disponibles. Le CLI Codex doit proposer la commande expérimentale `queue --thread --message` ; toutes les distributions ne la fournissent pas. Aucune clé API OpenAI n’est utilisée ; les réponses dépendent des outils et quotas de votre conversation.

Salons texte standards uniquement : pas de MP, fils, forums ou pièces jointes ; réponses textuelles limitées à 2 000 caractères. Une publication incertaine interrompt le traitement et exige une vérification explicite. Cette première release ne garantit pas la compatibilité de chaque installation Codex.

[Installation détaillée](https://github.com/Rokaido71/Astro/blob/main/docs/installation.md) · [Utilisation et récupération](https://github.com/Rokaido71/Astro/blob/main/docs/usage.md) · [Licence MIT et notices tierces](https://github.com/Rokaido71/Astro/blob/main/THIRD_PARTY.md)
