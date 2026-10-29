# Gestion des accès

L'application distingue :

- les **permissions**, qui représentent un droit élémentaire ;
- les **groupes**, qui regroupent plusieurs permissions ;
- les **utilisateurs**, auxquels on affecte un ou plusieurs groupes.

Les permissions effectives d'un utilisateur correspondent à l'union des permissions de tous ses groupes.

Un utilisateur peut donc appartenir à plusieurs groupes.

## Règles générales

- Le groupe `ADMIN` possède toutes les permissions.
- Une permission `WRITE` implique automatiquement la permission `READ` correspondante.
- Les permissions sont cumulatives entre les groupes.
- Les droits de suppression sont réservés au groupe `ADMIN`.
- Un utilisateur inactif ne possède aucune permission effective.
- Les contrôles d'accès doivent être appliqués côté serveur. Les masquages de pages et de boutons dans l'interface sont uniquement visuels.
- Il n'existe pas de groupe `BUREAU` dans le nouveau modèle.

## Permissions

### Adhésions

```text
ADHESIONS_READ
ADHESIONS_WRITE
```

`ADHESIONS_WRITE` implique `ADHESIONS_READ`.

### Arbitrage

```text
ARBITRAGE_READ
ARBITRAGE_WRITE
```

`ARBITRAGE_WRITE` implique `ARBITRAGE_READ`.

### OTM

```text
OTM_READ
OTM_WRITE
```

`OTM_WRITE` implique `OTM_READ`.

### Matchs

```text
MATCHS_READ
MATCHS_WRITE
```

`MATCHS_WRITE` implique `MATCHS_READ`.

### Imports

```text
IMPORT_FBI_LICENCES
IMPORT_MATCH
IMPORT_ASSOCONNECT
```

`IMPORT_FBI_LICENCES` couvre les imports FBI des licences et des préinscriptions.

### Administration et communication

```text
ACCESS
COMMUNICATION
```

`ACCESS` permet de gérer les utilisateurs et leurs groupes.

`COMMUNICATION` permet d'accéder aux fonctions de communication de l'application.

## Groupes

### ADMIN

Le groupe `ADMIN` possède toutes les permissions :

```text
ADHESIONS_READ
ADHESIONS_WRITE
ARBITRAGE_READ
ARBITRAGE_WRITE
OTM_READ
OTM_WRITE
MATCHS_READ
MATCHS_WRITE
IMPORT_FBI_LICENCES
IMPORT_MATCH
IMPORT_ASSOCONNECT
ACCESS
COMMUNICATION
```

Le groupe `ADMIN` peut également modifier et supprimer les éléments lorsque le module le permet.

### COACH

Le groupe `COACH` possède :

```text
MATCHS_READ
MATCHS_WRITE
ARBITRAGE_READ
ARBITRAGE_WRITE
OTM_READ
OTM_WRITE
```

### COORDINATION_OTM

Le groupe `COORDINATION_OTM` possède :

```text
OTM_READ
OTM_WRITE
MATCHS_READ
MATCHS_WRITE
ARBITRAGE_READ
```

### COORDINATION_ARBITRAGE

Le groupe `COORDINATION_ARBITRAGE` possède :

```text
ARBITRAGE_READ
ARBITRAGE_WRITE
MATCHS_READ
MATCHS_WRITE
OTM_READ
```

## Exemples d'affectation

Un utilisateur affecté uniquement au groupe `COORDINATION_OTM` possède les permissions :

```text
OTM_READ
OTM_WRITE
MATCHS_READ
MATCHS_WRITE
ARBITRAGE_READ
```

Un utilisateur affecté aux groupes `COACH` et `COORDINATION_OTM` possède l'union des permissions de ces deux groupes.

Un utilisateur affecté au groupe `ADMIN` possède toutes les permissions, quel que soit le nombre de groupes supplémentaires qui lui sont affectés.

## Suppressions et désactivations

Les permissions `WRITE` autorisent la création et la modification des données du module.

Les suppressions sont réservées au groupe `ADMIN` afin de préserver l'historique et l'intégrité des données.

Lorsque cela est possible, une désactivation ou une annulation métier doit être préférée à une suppression physique.

## Structure des données

### Table `Utilisateurs`

La table `Utilisateurs` contient une ligne stable par compte Google :

```text
Utilisateur_id
Email
Nom
Prenom
Actif
Date_maj
```

`Utilisateur_id` est un identifiant interne stable, par exemple :

```text
USR-000001
```

L'adresse `Email` sert à identifier le compte Google connecté. Elle est normalisée en minuscules et doit être unique.

`Actif = Non` désactive l'accès de l'utilisateur et de tous ses groupes.

### Table `Utilisateurs_Groupes`

Les groupes sont affectés aux utilisateurs dans une table de liaison :

```text
Utilisateur_groupe_id
Utilisateur_id
Groupe_code
Actif
Date_maj
```

Exemple :

```text
USRGRP-000001 | USR-000001 | COACH                 | Oui | ...
USRGRP-000002 | USR-000001 | COORDINATION_OTM     | Oui | ...
```

Les valeurs autorisées pour `Groupe_code` sont :

```text
ADMIN
COACH
COORDINATION_OTM
COORDINATION_ARBITRAGE
```

Un couple `Utilisateur_id + Groupe_code` ne doit exister qu'une seule fois.

Un groupe inactif ne contribue pas aux permissions effectives de l'utilisateur.

### Permissions dans le code

Les permissions restent définies dans la configuration de l'application. Il n'est pas nécessaire de créer une table `Permissions` tant que le catalogue reste stable.

La résolution des droits est la suivante :

```text
Utilisateur actif
    → groupes actifs
        → permissions des groupes
            → permissions effectives
```

### Migration depuis l'ancien modèle

L'ancien modèle utilise actuellement une colonne `Role` dans `Utilisateurs` avec les valeurs `ADMIN`, `BUREAU` et `COACH`.

La migration doit être progressive :

1. ajouter `Utilisateur_id` et `Date_maj` à `Utilisateurs` ;
2. créer `Utilisateurs_Groupes` ;
3. attribuer les groupes aux utilisateurs existants ;
4. modifier l'authentification pour lire les groupes ;
5. vérifier les permissions effectives ;
6. conserver temporairement la colonne `Role` comme référence de migration ;
7. supprimer ou désactiver l'ancien fonctionnement uniquement après validation.

Les utilisateurs existants `ADMIN` et `COACH` peuvent être migrés automatiquement vers les groupes correspondants.

Les anciens utilisateurs `BUREAU` nécessitent une affectation manuelle, car le groupe `BUREAU` n'existe plus dans le nouveau modèle et ses anciens droits doivent être répartis selon les besoins réels.

Les changements de groupes doivent être historisés dans l'onglet `Historique` avec le module `ACCES`.

## Évolution future

Les groupes pourront être complétés ultérieurement si de nouveaux besoins apparaissent. Les permissions doivent rester suffisamment fines pour permettre la création de nouveaux groupes sans modifier les données métier existantes.
