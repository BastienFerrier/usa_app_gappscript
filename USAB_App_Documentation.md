# US Aussonne Basket --- Application de gestion du club

## 1. Présentation et contexte

Cette application interne est développée pour **US Aussonne Basket**
afin de centraliser et simplifier plusieurs activités de gestion du
club.

Le club utilise plusieurs outils externes, notamment **AssoConnect**,
**SportEasy** et **FBI / FFBB**. Ces outils répondent chacun à un besoin
particulier mais ne fournissent pas une vue consolidée des adhérents,
des équipes et des opérations du club.

L'application sert donc de **couche de consolidation et de pilotage**.
Elle ne remplace pas nécessairement les outils sources : elle rapproche
leurs données et ajoute les informations de gestion propres au club.

### Objectifs principaux

- centraliser les informations utiles à la gestion du club ;
- réduire les contrôles manuels entre plusieurs outils ;
- faciliter le suivi des adhésions et licences ;
- gérer le planning sportif ;
- structurer la gestion de l'arbitrage ;
- fournir progressivement des tableaux de bord ;
- permettre au bureau de travailler dans une interface unique ;
- conserver un modèle suffisamment simple pour être maintenu par le
  club.

### Modules

L'application est organisée autour des modules suivants :

- **Accès / administration** : utilisateurs, rôles et droits ;
- **Planning** : entraînements, gymnases, disponibilités et
  entraîneurs ;
- **Adhésions** : rapprochement AssoConnect / SportEasy / FBI et suivi
  administratif ;
- **Arbitrage** : vivier d'arbitres, niveau, origine et, à terme,
  affectations aux matchs ;
- **Dashboard** : espace destiné aux indicateurs synthétiques du club.

### Gestion des données permanentes et saisonnières

L'application distingue deux types de données :

- **les données permanentes**, qui restent valables d'une saison à l'autre, comme les contacts, les identifiants des personnes ou les numéros de licence FFBB ;
- **les données saisonnières**, qui dépendent d'une saison sportive, comme les adhésions, les catégories, l'arbitrage, les équipes ou, à terme, les matchs et leurs affectations.

Toute donnée saisonnière doit être rattachée à un `Saison_id`.

Lorsqu'une page ou une fonctionnalité manipule des données saisonnières, l'utilisateur doit pouvoir identifier et sélectionner la saison sur laquelle il travaille.

Par défaut, l'application peut sélectionner la saison marquée comme active dans la table `Saisons`, tout en permettant de consulter les saisons précédentes lorsque cela est pertinent.

La saison sélectionnée doit être utilisée de manière cohérente pour toutes les lectures et écritures réalisées depuis la page concernée.

Il faut éviter de coder une saison en dur dans le frontend ou le backend, par exemple :

`"2026-2027"`

## La saison doit être déterminée à partir de la configuration et/ou de la sélection de l'utilisateur.

## 2. Architecture générale

### 2.1 Stack technique

L'application est une **Google Apps Script Web App**.

Elle repose principalement sur :

- **Google Apps Script** pour le backend ;
- **HTML / CSS / JavaScript** pour l'interface Web ;
- **Google Sheets** comme base de données ;
- **Google Drive** pour le stockage des fichiers sources/imports ;
- les services Google Apps Script pour accéder à Sheets, Drive et à
  l'utilisateur connecté.

L'objectif est volontairement de conserver une architecture légère,
adaptée à une association sportive et à l'écosystème Google Workspace.

### 2.2 Principe général

```text
Utilisateurs
     │
     ▼
Google Apps Script Web App
     │
     ├── Authentification / autorisations
     │
     ├── Modules métier
     │
     ├── Imports / rapprochements
     │
     ▼
Google Sheets
     │
     ├── Administration
     ├── Sport
     └── Adhésions

Google Drive
     │
     └── Exports / fichiers sources
            ├── AssoConnect
            ├── FBI
            └── autres sources à venir
```

Les Google Sheets sont utilisés comme tables structurées. Les accès aux
colonnes doivent se faire autant que possible **par nom d'en-tête et non
par numéro de colonne**, afin de rendre le modèle plus robuste aux
évolutions.

---

## 3. Bases Google Sheets

Trois classeurs principaux sont actuellement utilisés.

### 3.1 USAB - Administration

Contient les données techniques et administratives de l'application.

#### Table `Utilisateurs`

```text
Email
Nom
Prenom
Role
Actif
```

Cette table détermine qui peut utiliser l'application et avec quel rôle.

Rôles actuellement prévus :

- `ADMIN`
- `BUREAU`
- `COACH`

#### Historique global prévu

Un historique transversal pourra utiliser la structure :

```text
Date_heure
Utilisateur
Module
Objet
Reference
Action
Champ
Ancienne_valeur
Nouvelle_valeur
```

L'objectif est de pouvoir tracer les modifications importantes réalisées
dans l'application.

---

### 3.2 USAB - Sport

Contient les informations liées à l'activité sportive.

Tables principales :

```text
Entrainements
Gymnase_dispo
Gymnases
equipes_couleurs
Entraineurs
Arbitrage
```

#### Table `Arbitrage`

```text
Arbitre_id
Saison_id
Contact_id
Type
Prenom_externe
Nom_externe
Email_externe
Telephone_externe
Niveau
Actif
Commentaire
Date_maj
```

Types d'arbitres :

```text
JOUEUR
CLUB
EXTERIEUR
```

Niveaux d'arbitrage :

```text
DEBUTANT
APPRENTISSAGE
AUTONOME
CONFIRME
REFERENT
```

Pour un arbitre `JOUEUR`, l'identité n'est **pas dupliquée** dans cette
table. `Contact_id` référence la table `Contacts`.

Pour un arbitre `CLUB` ou `EXTERIEUR`, `Contact_id` reste vide et les
informations d'identité sont stockées dans les champs `*_externe`.

Une ligne n'est pas créée automatiquement pour chaque joueur. Les
joueurs éligibles sont récupérés depuis les adhésions et une ligne
`Arbitrage` est créée lorsqu'une évaluation est enregistrée.

---

### 3.3 USAB - Adhésions

Contient le référentiel personnes, adhésions et imports.

Tables :

```text
Saisons
Contacts
Relations_contacts
Adhesions
Import_Assoconnect
Import_SportEasy
Import_FBI
Historique
```

#### `Saisons`

```text
Saison_id
Libelle
Date_debut
Date_fin
Active
```

Exemple :

```text
2026-2027 | 2026/2027 | 01/08/2026 | 31/07/2027 | Oui
```

#### `Contacts`

```text
Contact_id
Assoconnect_id
Licence_ffbb
Prenom
Nom
Date_naissance
Sexe
Email
Telephone_mobile
Telephone_fixe
Adresse
Complement
Code_postal
Ville
Pays
Actif
```

`Contact_id` est l'identifiant interne stable d'une personne, par
exemple :

```text
CNT-000001
```

Il ne doit pas être construit à partir du nom ou du prénom.

La licence FFBB appartient au **contact** et non à l'adhésion annuelle.

#### `Relations_contacts`

```text
Relation_id
Contact_id
Contact_lie_id
Type_relation
Saison_id
Actif
```

Cette table permet de représenter les relations entre personnes, par
exemple joueur / responsable légal.

#### `Adhesions`

Principaux champs :

```text
Adhesion_id
Saison_id
Contact_id
Assoconnect_billet
Assoconnect_transaction
Statut_assoconnect
Categorie
Montant_du
Statut_paiement
Moyen_paiement
Moyens_paiement_manuel
Montant_paiement_manuel_recu
Paiement_hors_ligne_recu
AtoutSport_demande
AtoutSport_recu
PassSport_demande
PassSport_recu
Caution_arbitrage_requise
Cautions_arbitrage_recues
Caution_arbitrage_statut
Surmaillot_requis
Surmaillot_commande
SportEasy_ok
SportEasy_equipe
Licence_statut
Licence_fonctions
Commentaire
Date_maj
```

L'adhésion est rattachée à une saison. Une même personne conserve son
`Contact_id` d'une saison à l'autre mais possède une nouvelle adhésion.

#### `Import_Assoconnect`

Cette table est un **cache normalisé des exports AssoConnect**.

Elle permet de découpler :

```text
fichier XLSX brut
      ↓
import / normalisation
      ↓
Import_Assoconnect
      ↓
synchronisation
      ↓
Contacts + Adhesions
```

AssoConnect reste la source principale pour l'inscription et le paiement
annuel. L'application assure ensuite le rapprochement et le suivi.

#### `Import_FBI`

Même principe pour les données provenant de FBI / FFBB.

Les statuts de licence utilisés dans l'application comprennent notamment
:

```text
A_ENVOYER
ATTENTE_SAISIE
EN_COURS_SAISIE
ATTENTE_VALIDATION_CLUB
LICENCE_GENEREE
A_VERIFIER
```

`LICENCE_GENEREE` est le seul statut considéré comme une licence
finalisée.

---

## 4. Modèle de données

Le modèle repose principalement sur les relations suivantes :

```text
Saisons
   │
   ├──────────────┐
   ▼              ▼
Adhesions      Arbitrage
   │              │
   ▼              │
Contacts ◄────────┘
   │
   ▼
Relations_contacts
```

### Principes de modélisation

1.  **Une personne = un Contact.**
2.  **Une inscription annuelle = une Adhesion.**
3.  Les données permanentes sont stockées sur `Contacts`.
4.  Les données propres à une saison sont stockées sur `Adhesions` ou
    dans les tables métier avec `Saison_id`.
5.  Les données issues d'un système externe sont d'abord normalisées
    dans une table `Import_*`.
6.  Éviter de dupliquer une donnée lorsqu'une relation par identifiant
    permet de la retrouver.
7.  Les identifiants internes (`Contact_id`, `Adhesion_id`,
    `Arbitre_id`, etc.) doivent rester stables.
8.  Les valeurs techniques doivent être normalisées et indépendantes des
    libellés affichés dans l'interface.

Exemple :

```text
AUTONOME
```

est une valeur technique, tandis que :

```text
Autonome
```

est un libellé UI.

---

## 5. Google Drive et imports

### Principe

Les exports provenant des outils externes sont déposés dans Google
Drive.

Un dossier racine `Extracts` contient les données utilisées par les
imports.

L'organisation est prévue par source et par saison, par exemple :

```text
Extracts/
├── AssoConnect/
│   └── 2026-2027/
└── FBI/
    └── 2026-2027/
        ├── PREINSCRIPTION/
        └── LICENCIES/
```

Les IDs Drive sont configurés dans `00_Config.gs`.

Exemple de configuration :

```js
const DRIVE_FOLDERS = {
  EXTRACTS: "...",
};

const IMPORT_FOLDERS = {
  ASSOCONNECT: {
    "2026-2027": "...",
  },

  FBI: {
    "2026-2027": {
      PREINSCRIPTION: "...",
      LICENCIES: "...",
    },
  },
};
```

### Droits Drive

Les droits sur le dossier d'imports sont synchronisés avec les rôles de
l'application.

Principe actuel :

```text
ADMIN   → EDITOR
BUREAU  → EDITOR
COACH   → NONE
```

Le mécanisme est géré par le module d'accès.

### Données sensibles

Les imports doivent respecter un principe de **minimisation des
données**.

Par exemple, les informations médicales éventuellement présentes dans un
export AssoConnect ne doivent pas être importées automatiquement dans le
référentiel de l'application si elles ne sont pas nécessaires.

---

## 6. Structure du projet Apps Script

Convention actuelle :

```text
00_Config.gs
01_Main.gs
02_Utils.gs
03_Auth.gs
04_Access.gs
05_Access.html

10_Planning.gs
11_Planning.html

20_Adhesions.gs
21_Adhesions.html

30_Arbitrage.gs
31_Arbitrage.html

40_Dashboard.gs
41_Dashboard.html

90_Index.html
91_Styles.html
92_Scripts.html
```

La numérotation permet de regrouper visuellement les fichiers par
responsabilité.

### `00_Config.gs`

Configuration globale de l'application :

- IDs des Google Sheets ;
- IDs des dossiers Drive ;
- configuration des imports ;
- constantes globales ;
- paramètres indépendants de l'interface.

Les IDs de ressources ne doivent pas être dispersés dans les modules
métier.

### `01_Main.gs`

Point d'entrée de la Web App.

Contient notamment :

- `doGet()`;
- construction de la page ;
- inclusion des fichiers HTML.

### `02_Utils.gs`

Fonctions utilitaires partagées.

Exemples :

- lecture d'un classeur ;
- lecture d'une feuille ;
- conversion des données ;
- parsing des heures ;
- normalisation des jours ;
- fonctions génériques Sheets.

Point important :

```js
readSheetAsObjects(sheet);
```

retourne :

```js
{
  headers: [...],
  rows: [...]
}
```

et **pas directement le tableau de lignes**.

Il faut donc utiliser :

```js
const data = readSheetAsObjects(sheet);
const rows = data.rows;
```

### `03_Auth.gs`

Authentification de l'utilisateur.

Responsabilités :

- récupérer l'adresse Google de l'utilisateur connecté ;
- vérifier que l'utilisateur existe dans `Utilisateurs` ;
- vérifier que son compte est actif ;
- récupérer son rôle ;
- refuser l'accès si nécessaire.

Fonctions typiques :

```text
getCurrentUserEmail()
getCurrentUser()
requireAuthorizedUser()
requireRole()
```

### `04_Access.gs`

Gestion des utilisateurs et autorisations.

Responsabilités :

- ajouter/modifier les utilisateurs ;
- synchroniser les droits ;
- appliquer les permissions aux fichiers Google Sheets ;
- appliquer les permissions aux dossiers Drive.

### `05_Access.html`

Interface d'administration des accès.

### `10_Planning.gs`

Backend du module Planning.

Responsabilités :

- entraînements ;
- disponibilités des gymnases ;
- gymnases ;
- entraîneurs ;
- couleurs des équipes ;
- préparation des données nécessaires à l'affichage du planning.

### `11_Planning.html`

Vue HTML du planning.

### `20_Adhesions.gs`

Backend du module Adhésions.

Il contient notamment la logique :

- contacts ;
- adhésions ;
- imports AssoConnect ;
- imports FBI ;
- rapprochements ;
- suivi du dossier ;
- statut de paiement ;
- AtoutSport ;
- Pass'Sport ;
- caution arbitrage ;
- SportEasy ;
- licence FFBB.

### `21_Adhesions.html`

Vue du module Adhésions.

### `30_Arbitrage.gs`

Backend du module Arbitrage.

Responsabilités actuelles :

- constitution du vivier des arbitres ;
- récupération des joueurs éligibles ;
- gestion des arbitres Club / Extérieur ;
- niveaux d'arbitrage ;
- création / modification / suppression des arbitres externes.

Catégories joueurs actuellement prises en compte :

```text
U13F
U13M
U15F
U15M
U18F
U18M
SENIORS_F
SENIORS_M
```

Les catégories U7/U9/U11 ne font actuellement pas partie du vivier.

### `31_Arbitrage.html`

Interface du module Arbitrage :

- indicateurs ;
- filtres ;
- tableau ;
- modification directe du niveau ;
- ajout d'un arbitre ;
- fiche d'un arbitre Club / Extérieur.

### `40_Dashboard.gs` / `41_Dashboard.html`

Module destiné aux tableaux de bord et indicateurs consolidés.

### `90_Index.html`

Structure principale de l'application Web.

Typiquement :

- navigation ;
- sidebar ;
- conteneur principal ;
- chargement des différents modules.

### `91_Styles.html`

Feuille de style globale de l'application.

Les styles spécifiques à un module doivent utiliser des préfixes
explicites afin de limiter les collisions, par exemple :

```text
arbitrage-*
adhesions-*
access-*
```

### `92_Scripts.html`

JavaScript exécuté côté navigateur.

Il gère notamment :

- chargement des modules ;
- événements UI ;
- filtres ;
- modales ;
- rendu dynamique ;
- appels `google.script.run` vers le backend Apps Script.

---

## 7. Authentification et autorisations

### Authentification

L'application s'appuie sur le compte Google connecté.

L'adresse est récupérée avec :

```js
Session.getActiveUser().getEmail();
```

Le déploiement de la Web App est configuré pour s'exécuter avec
l'identité de l'utilisateur qui accède à l'application.

**Ne pas modifier ce principe sans analyser les conséquences sur les
droits Sheets / Drive.**

### Autorisation applicative

L'authentification Google ne suffit pas.

L'utilisateur doit également :

1.  exister dans la table `Utilisateurs` ;
2.  être marqué actif ;
3.  posséder un rôle autorisé pour l'action demandée.

### Matrice actuelle

```text
                ADMINISTRATION   SPORT    ADHESIONS
ADMIN           EDITOR           EDITOR   EDITOR
BUREAU          READER           EDITOR   EDITOR
COACH           READER           READER   NONE
```

### Contrôle backend obligatoire

Les droits affichés dans l'interface ne constituent **jamais** une
protection suffisante.

Toute fonction backend sensible doit commencer par une validation
appropriée, par exemple :

```js
requireAuthorizedUser();
```

ou :

```js
requireRole(["ADMIN", "BUREAU"]);
```

La sécurité doit être contrôlée côté serveur, même si le bouton
correspondant est masqué dans l'interface.

---

## 8. Communication frontend / backend

Le frontend appelle Apps Script avec :

```js
google.script.run
  .withSuccessHandler(...)
  .withFailureHandler(...)
  .fonctionBackend(...);
```

### Sérialisation

Attention : toutes les valeurs Apps Script ne sont pas directement
sérialisables vers le navigateur.

En particulier, ne pas retourner directement certains objets complexes
ou un `Date` non converti.

Pour les dates, utiliser par exemple :

```js
function formatDateForClient(value) {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}
```

Ce point a notamment été rencontré sur `Date_maj` du module Arbitrage.

---

## 9. Conventions de développement

### En-têtes des tables

Les en-têtes techniques doivent rester simples :

- pas d'accent ;
- pas d'espace ;
- noms stables ;
- `snake_case` ou convention existante conservée.

Exemple :

```text
Caution_arbitrage_statut
```

et non :

```text
Statut de la caution d'arbitrage
```

### Valeurs techniques

Utiliser des constantes normalisées :

```text
OUI
NON
NA

JOUEUR
CLUB
EXTERIEUR

DEBUTANT
APPRENTISSAGE
AUTONOME
CONFIRME
REFERENT
```

Les libellés utilisateur peuvent ensuite être différents.

### Valeurs tri-state

Pour certains contrôles :

```text
""     → À renseigner
OUI    → Oui / donné
NON    → Non / non donné
NA     → Non applicable
```

Un champ vide ne signifie donc pas toujours `NON`.

### Accès aux colonnes

Éviter :

```js
row[17];
```

Préférer la construction d'objets à partir des en-têtes :

```js
row.Categorie;
row.Contact_id;
row.Licence_statut;
```

### Écriture concurrente

Pour les opérations susceptibles d'être réalisées simultanément,
utiliser `LockService`, typiquement :

```js
const lock = LockService.getScriptLock();

lock.waitLock(30000);

try {
  // lecture la plus récente
  // contrôles
  // écriture
} finally {
  lock.releaseLock();
}
```

Lorsque la cohérence dépend de l'état courant de la table, **relire les
données après l'acquisition du lock**.

### Idempotence

Les imports et synchronisations doivent autant que possible être
idempotents :

> Relancer la même opération ne doit pas créer de doublons ni altérer
> inutilement les données.

### Validation backend

Toujours valider côté backend :

- paramètres obligatoires ;
- valeurs autorisées ;
- existence des références ;
- unicité ;
- droits utilisateur ;
- cohérence métier.

Ne jamais considérer la validation HTML/JavaScript comme suffisante.

---

## 10. Gestion des imports

### Principe recommandé

Chaque connecteur suit idéalement le pipeline :

```text
Source externe
      ↓
Fichier brut
      ↓
Lecture
      ↓
Normalisation
      ↓
Import_Source
      ↓
Contrôles
      ↓
Synchronisation métier
      ↓
Tables de référence
```

Cela permet de distinguer :

- ce qui vient réellement de la source ;
- ce que l'application a interprété ;
- ce qui a finalement été synchronisé.

### Ne pas écraser aveuglément les données

Une donnée provenant d'un nouvel import ne doit pas automatiquement
écraser une donnée interne sans règle explicite.

Il faut déterminer pour chaque champ :

- quelle est la source de vérité ;
- si le champ est permanent ou saisonnier ;
- si une correction manuelle interne doit être conservée ;
- comment gérer un conflit.

---

## 11. Sources de vérité

Le développeur doit identifier la source de vérité avant de modifier une
synchronisation.

### AssoConnect

Principalement source de vérité pour :

- demande d'inscription ;
- informations fournies lors de l'inscription ;
- paiement de l'adhésion.

### FBI / FFBB

Source de vérité pour :

- numéro de licence FFBB ;
- avancement de la préinscription/licence ;
- licence générée ;
- informations fédérales importées.

### SportEasy

Utilisé pour l'organisation des équipes et la communication sportive.
Certaines informations sont rapprochées dans l'application.

### Application USAB

Source de vérité pour les données internes qui n'existent pas
nécessairement dans les outils précédents :

- contrôles administratifs internes ;
- statut de réception de certaines aides/documents ;
- suivi des cautions ;
- évaluation des arbitres ;
- organisation future des affectations d'arbitrage ;
- autres informations de pilotage du club.

---

## 12. Exigences fonctionnelles et techniques

### Simplicité

L'application doit rester maintenable pour un club associatif.

Éviter :

- architecture inutilement complexe ;
- dépendances externes non nécessaires ;
- duplication de données ;
- automatisations difficiles à diagnostiquer.

### Fiabilité

Une erreur d'import ou d'interface ne doit pas corrompre les données.

Toute écriture importante doit comporter :

1.  contrôle des droits ;
2.  validation des entrées ;
3.  contrôle de l'existence des objets ;
4.  contrôle des doublons si nécessaire ;
5.  écriture ;
6.  retour explicite au frontend.

### Traçabilité

Les actions importantes doivent progressivement être enregistrées dans
`Historique`.

Objectif :

```text
qui ?
quand ?
dans quel module ?
sur quel objet ?
quelle action ?
quelle ancienne valeur ?
quelle nouvelle valeur ?
```

### Protection des données

L'application contient des données personnelles de licenciés, dont des
mineurs.

Principes :

- minimisation des données ;
- accès selon le besoin ;
- ne pas importer une donnée sensible sans nécessité ;
- limiter les droits Drive/Sheets ;
- ne pas exposer les IDs ou informations internes inutilement côté
  frontend ;
- conserver uniquement les données nécessaires au fonctionnement du
  club.

### Responsive

L'application doit rester utilisable sur ordinateur et, pour les actions
courantes, sur mobile.

Les tableaux complexes peuvent être optimisés prioritairement pour
desktop, mais les actions essentielles ne doivent pas devenir
inutilisables sur petit écran.

### UX

Principes actuels :

- interface sobre ;
- cohérence entre modules ;
- actions principales clairement visibles ;
- utilisation de cartes pour les indicateurs ;
- filtres proches des tableaux ;
- badges pour faciliter la lecture ;
- modales pour les créations/modifications courtes ;
- retour visuel lors des sauvegardes ;
- éviter les rechargements complets inutiles.

---

## 13. Arbitrage --- conception actuelle et évolutions prévues

Le module Arbitrage est construit en deux concepts distincts.

### Vivier des arbitres

Déjà en cours d'implémentation.

Il répond à :

> Qui peut arbitrer et quel est son niveau ?

Il comprend :

- joueurs ;
- membres du club ;
- personnes extérieures ;
- niveau d'arbitrage ;
- catégorie du joueur ;
- filtres ;
- indicateurs.

### Affectation aux matchs

Prévue ultérieurement.

Elle répondra à :

> Qui arbitre quel match ?

Architecture envisagée :

```text
Matchs
Affectations_matchs
Niveaux_arbitrage_equipes
```

Il est recommandé de ne **pas** créer dans `Matchs` des colonnes :

```text
Arbitre_1
Arbitre_2
OTM_1
OTM_2
...
```

Préférer une table générique :

```text
Affectation_id
Saison_id
Match_id
Personne_id
Role
Date_maj
```

avec par exemple :

```text
ARBITRE
OTM
RESPONSABLE_SALLE
```

Cela permettra ensuite de produire facilement des statistiques :

- nombre de matchs arbitrés par personne ;
- contribution par équipe ;
- contribution par catégorie ;
- répartition arbitrage / OTM ;
- besoins non couverts.

### Suppression d'un arbitre

Actuellement, un arbitre `CLUB` ou `EXTERIEUR` peut être physiquement
supprimé car aucun historique de match ne dépend encore de lui.

Lorsque les affectations aux matchs seront créées, cette règle devra
évoluer.

Un arbitre ayant un historique devra être **désactivé** :

```text
Actif = Non
```

plutôt que supprimé, afin de préserver l'intégrité de l'historique.

---

## 14. Gestion des saisons

Une grande partie des données métier est saisonnière.

Ne pas coder la saison directement dans les fonctions à long terme :

```js
"2026-2027";
```

La cible est de récupérer la saison active depuis `Saisons`.

Les données permanentes, telles que le contact ou son numéro de licence
FFBB, ne doivent pas être recréées à chaque saison.

Les données comme :

- adhésion ;
- catégorie ;
- caution ;
- niveau d'arbitrage si considéré saisonnier ;
- affectations aux matchs ;

doivent être rattachées explicitement à `Saison_id`.

---

## 15. Points de vigilance connus

### `readSheetAsObjects`

La fonction retourne :

```js
{
  (headers, rows);
}
```

Toujours utiliser `.rows`.

### Dates Apps Script → navigateur

Ne pas retourner directement un objet `Date` via `google.script.run`.

Le convertir en chaîne, idéalement ISO.

### Doublons

Les créations doivent vérifier les doublons sur une clé métier adaptée.

Exemple pour un arbitre externe :

```text
Saison_id
+ Type
+ Prenom normalisé
+ Nom normalisé
```

### Normalisation des identités

Pour comparer des identités, normaliser au minimum :

- espaces ;
- casse ;
- accents.

Mais ne pas utiliser le nom/prénom comme identifiant permanent d'une
personne.

### Suppressions

Avant d'introduire une suppression physique, vérifier si l'objet peut
être référencé ailleurs.

En présence d'un historique, privilégier :

```text
Actif = Non
```

### Hard-code

Éviter progressivement les valeurs codées en dur qui peuvent devenir
configurables :

- saison ;
- catégories ;
- statuts ;
- règles de caution ;
- niveaux ;
- mappings d'import.

Une constante métier stable peut rester dans le code ; une donnée
susceptible d'être administrée doit idéalement être configurable.

---

## 16. Méthode recommandée pour faire évoluer l'application

Pour toute nouvelle fonctionnalité :

### 1. Définir le besoin métier

Exemple :

> Affecter deux arbitres à un match à domicile.

### 2. Définir le modèle de données

Avant de créer l'interface.

Identifier :

- objets ;
- identifiants ;
- relations ;
- saisonnalité ;
- historique ;
- règles de suppression.

### 3. Créer et tester le backend

Valider d'abord :

- lecture ;
- validation ;
- création ;
- modification ;
- cas d'erreur ;
- idempotence.

### 4. Créer l'interface

Une fois les données fiables.

### 5. Ajouter les contrôles UX

- loading ;
- succès ;
- erreur ;
- confirmation ;
- état vide ;
- responsive.

### 6. Vérifier les droits

Tester au minimum avec les rôles :

```text
ADMIN
BUREAU
COACH
```

### 7. Vérifier les impacts sur les données existantes

Une évolution de structure ne doit pas rendre les anciennes lignes
illisibles.

---

## 17. Principes à conserver

Pour maintenir la cohérence de l'application :

> **Backend fiable avant interface sophistiquée.**

> **Une donnée = une source de vérité clairement identifiée.**

> **Ne pas dupliquer une information récupérable par relation.**

> **Les contrôles de sécurité sont réalisés côté serveur.**

> **Les données saisonnières portent un `Saison_id`.**

> **Les imports sont séparés des tables métier.**

> **Les valeurs techniques restent stables même si les libellés UI
> changent.**

> **Les suppressions ne doivent jamais casser l'historique.**

> **Le modèle doit rester compréhensible et maintenable par un futur
> développeur.**

---

## 18. Documentation à maintenir

Ce document doit évoluer en même temps que l'application.

Lorsqu'une évolution importante est ajoutée, mettre à jour au minimum :

- architecture ;
- tables et colonnes ;
- relations ;
- nouvelles valeurs techniques ;
- rôles et autorisations ;
- nouvelles sources externes ;
- règles métier importantes ;
- structure Apps Script ;
- points de vigilance connus.

Une documentation obsolète peut être plus dangereuse qu'une
documentation incomplète : toute règle qui n'est plus vraie doit être
corrigée ou supprimée.
