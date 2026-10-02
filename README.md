# orivo-plugin-registry

L'index signé que lit Orivo pour afficher ses plugins dans **Réglages →
Plugins**. Le host pointe sur
[`index.v1.json`](https://raw.githubusercontent.com/justeozan/orivo-plugin-registry/main/index.v1.json)
(`REGISTRY_INDEX_URL` dans `src-tauri/src/plugin_index.rs`), vérifie la
signature, puis se sert de l'entrée — en dehors de cela, seule la liste
compilée dans le binaire existe.

## Le format

```jsonc
{
  "formatVersion": 1,
  "document":  "<l'index, verbatim, en une chaîne JSON>",
  "signature": "<Ed25519 base64 sur sha256(contexte || document)>"
}
```

La signature couvre la **chaîne exacte** telle que le publisher l'a écrite :
pas de règle de canonicalisation que deux encoders JSON devraient partager.
Le document commence par `orivo-plugin-registry-index-v1\0` avant d'être
haché (domain separation) : une signature de paquet et une signature d'index
ne peuvent jamais être confondues.

Côté host, tout est revalidé *après* la signature (`plugin_index.rs`) :
séquence monotone (anti-rejeu), `expiresAtEpochMs` future, taille bornée,
URL https sur l'allowlist compilée, empreintes et tailles bien formées.

## Publier un index

1. Éditer `index.document.json` : entrées `plugins` (l'URL doit viser une
   release sur un hôte de l'allowlist, avec le `sha256` et la `sizeBytes`
   réels de l'archive).
2. **Monter `sequence`** (jamais reculer) et **repousser
   `expiresAtEpochMs`** (un index périmé est refusé par chaque client).
3. Signer et vérifier :

   ```sh
   cp /path/to/orivo-release.key keys/   # clé gitignorée, jamais committée
   node scripts/sign.mjs
   node scripts/verify.mjs
   ```

4. Committer `index.v1.json` sur `main`.

Les clients ne rechargent qu'à la TTL (6 h) ; la séquence est un plancher qui
ne recule jamais, donc un ancien index rejoué est inerte même s'il vérifie
encore.
