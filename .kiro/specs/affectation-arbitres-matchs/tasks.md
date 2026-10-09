# Implementation Plan: Module Matchs (affectation arbitres & OTM)

## Overview

Ce plan implémente le module Matchs en JavaScript (Google Apps Script), en suivant le
principe du projet « backend fiable avant interface » : les constantes et toute la couche
backend (`60_Matchs.js`) sont construites et vérifiées avant de câbler le frontend
(`61_Matchs.html`, `90_Index.html`, `91_Styles.html`, `92_Scripts.html`).

Le modèle d'affectations est générique (table `Affectations_matchs` avec un champ `Role`).
Chaque tâche s'appuie sur les précédentes et se termine par un câblage dans l'application,
sans code orphelin.

### Contrainte de test (Apps Script)

Il n'existe pas de runner de test standard sous Apps Script. La stratégie, conforme à la
section « Stratégie de test » du design, est :

- des fonctions `testXxx()` exécutables manuellement depuis l'éditeur Apps Script,
  regroupées dans un fichier `62_Matchs_tests.js` (hors chargement HTML) ;
- un mini-harnais de propriétés en mémoire (`runProperty(label, generator, predicate, iterations=100)`)
  qui simule les dépendances Sheets / `getArbitres` / `getOtm` par des mocks, pour isoler la
  logique sans coût Sheets ;
- chaque test de propriété est annoté **Feature: affectation-arbitres-matchs, Property {n}**.

Les tâches de test sont marquées optionnelles avec `*` et ne doivent pas être implémentées
automatiquement.

## Tasks

- [x] 1. Déclarer les constantes de configuration du module
  - Dans `00_Config.js`, ajouter l'objet `SHEETS` (`MATCHS`, `AFFECTATIONS_MATCHS`, `ARBITRAGE`, `SAISONS`, `HISTORIQUE`)
  - Ajouter `MATCHS_LIEUX` (`PIERRE_DENIS`, `GERMAINE_TILLON`, `EXTERIEUR`)
  - Ajouter `MATCHS_CATEGORIES` (U13F…SENIORS_M, dupliquées volontairement d'Arbitrage)
  - Ajouter `AFFECTATION_ROLES` (`ARBITRE`, `OTM`, `RESPONSABLE_SALLE`)
  - _Requirements: 5.4, 5.5, 11.3_

- [x] 2. Préparer les onglets Sheets (tables du module)
  - [x] 2.1 Écrire un initialiseur idempotent des onglets du classeur SPORT
    - Dans `60_Matchs.js`, ajouter `ensureMatchsSheets()` qui crée (si absents) les onglets `Matchs` et `Affectations_matchs` dans le classeur `SPREADSHEETS.SPORT`
    - Écrire les en-têtes exacts de `Matchs` : `Match_id, Saison_id, Date, Equipe1, Equipe2, Domicile_exterieur, Categorie, Score, Lieu, Responsable_salle, Date_maj`
    - Écrire les en-têtes exacts de `Affectations_matchs` : `Affectation_id, Saison_id, Match_id, Personne_id, Role, Slot, Date_maj`
    - Ne jamais écraser un onglet existant ni ses en-têtes déjà présents
    - _Requirements: 1.3, 10.1_

- [x] 3. Implémenter les helpers backend internes
  - [x] 3.1 Implémenter les helpers d'accès et d'identité
    - Dans `60_Matchs.js`, implémenter `getRequiredSheet(spreadsheet, name)` (lève une erreur explicite si l'onglet est absent)
    - Implémenter `formatMatchsDateForClient(value)` : `Date → toISOString()`, sinon `String(value || "")`
    - Implémenter `getNextAffectationId(rows)` : scan des `AFF-\d+`, max+1, `padStart(6,"0")`, préfixe `AFF-`
    - _Requirements: 1.4, 11.5_

  - [ ]\* 3.2 Tests de propriété pour sérialisation et génération d'id
    - **Property 2: Round-trip de sérialisation des dates** — **Validates: Requirements 1.4**
    - **Property 11: Génération d'identifiant stable et unique** — **Validates: Requirements 11.5**

  - [x] 3.3 Implémenter le logging d'historique mutualisé
    - Implémenter `logHistorique(entries)` écrivant N lignes dans l'onglet `Historique` du classeur `ADHESIONS`, au format 9 colonnes `[Date, Email, Module, Objet, Reference, Action, Champ, Ancienne_valeur, Nouvelle_valeur]`
    - `Module = "MATCHS"`, email issu de `requireAuthorizedUser()`, horodatage courant, valeurs rendues via `serializeHistoryValue`
    - _Requirements: 12.1, 12.2_

  - [ ]\* 3.4 Test de propriété pour la complétude d'historique
    - **Property 12: Complétude de l'entrée d'historique** — **Validates: Requirements 12.1, 12.2**

- [x] 4. Implémenter les lectures de saison
  - [x] 4.1 Implémenter `getActiveSaison()` et `listSaisons()`
    - `getActiveSaison()` : `requireAuthorizedUser()`, lit `Saisons`, retourne la ligne dont `Active` normalisé vaut `oui` (`{ Saison_id, Libelle, Active }`), ou `null`, sans saison codée en dur
    - `listSaisons()` : `requireAuthorizedUser()`, retourne toutes les saisons triées par `Saison_id` décroissant
    - _Requirements: 1.1, 2.2, 2.4_

  - [ ]\* 4.2 Tests unitaires des lectures de saison
    - Sélection de la saison active (`Active = Oui`), absence de saison active → `null`
    - COACH autorisé en lecture
    - _Requirements: 1.1, 2.4, 9.2_

- [x] 5. Implémenter la liste des matchs avec comptage d'affectations
  - [x] 5.1 Implémenter `listMatchs(saisonId)`
    - `requireAuthorizedUser()`, validation de `saisonId` obligatoire
    - Lit `Matchs` et `Affectations_matchs` via `readSheetAsObjects`, filtre les deux sur `Saison_id === saisonId`
    - Calcule les comptes par rôle `{ ARBITRE, OTM, RESPONSABLE_SALLE }` par match
    - Sérialise `Date` et `Date_maj` en ISO, trie par `Date` croissante
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.9, 10.3_

  - [ ] 5.3 Étendre `listMatchs` avec la résolution des arbitres de slot 1 et 2
    - Indexer les affectations `Role=ARBITRE` par `(Match_id, Slot)` et exposer, pour chaque match, `Arbitre1_id`/`Arbitre1_nom` et `Arbitre2_id`/`Arbitre2_nom`
    - Charger le vivier arbitres **une seule fois** via `getArbitresAffectables(saisonId)` et résoudre `"Prenom Nom"` ; repli sur le `Personne_id` si absent du vivier ; dégrader en `[]` sans erreur si le vivier est indisponible (ex. COACH)
    - Slot inoccupé → valeurs vides
    - _Requirements: 1.6, 1.7_

  - [ ]\* 5.2 Tests de propriété pour le filtrage et le comptage
    - **Property 1: Filtrage par saison** — **Validates: Requirements 1.2, 1.9**
    - **Property 3: Conservation du comptage d'affectations par rôle** — **Validates: Requirements 1.5**

  - [ ]\* 5.4 Test de propriété pour la résolution des arbitres de slot
    - **Property 17: Résolution du nom d'arbitre de slot dans la liste** — **Validates: Requirements 1.6, 1.7**

- [x] 6. Implémenter les viviers affectables (arbitres + OTM)
  - [x] 6.1 Implémenter `getArbitresAffectables(saisonId)`
    - `requireRole("ADMIN", "BUREAU")`, délègue à `getArbitres(saisonId)` de `30_Arbitrage.js`
    - Projette `{ Personne_id: Arbitre_id, Nom, Prenom, Categorie, Niveau, Type }`, ignore les entrées sans `Arbitre_id`, chaque élément porte le `Saison_id` demandé
    - _Requirements: 6.1_

  - [x] 6.2 Implémenter `getOtmAffectables(saisonId)` avec fallback gracieux
    - `requireAuthorizedUser()`, retourne `[]` si `saisonId` vide ou si `typeof getOtm !== "function"`
    - Si `getOtm` existe : projette `{ Personne_id, Nom, Prenom }` ; toute exception est capturée et dégradée en `[]` (jamais d'erreur à l'ouverture)
    - _Requirements: 8.1, 8.7_

  - [ ]\* 6.3 Tests pour l'appartenance saison des viviers et le fallback OTM
    - **Property 13: Appartenance saison des viviers** — **Validates: Requirements 6.1, 8.1, 8.7**
    - Test unitaire : `getOtmAffectables` renvoie `[]` sans erreur quand le module OTM est absent (8.7)

- [x] 7. Implémenter le détail d'un match
  - [x] 7.1 Implémenter `assertPersonneDansVivier(personneId, role, saisonId)` et `getMatchDetail(matchId)`
    - `assertPersonneDansVivier` : vérifie l'existence du `personneId` selon le rôle (`ARBITRE` → `getArbitresAffectables` ; `OTM` → `getOtmAffectables`), lève une erreur sinon
    - `getMatchDetail` : `requireAuthorizedUser()`, valide `matchId`, lève « match introuvable » si absent
    - Retourne les affectations du match **filtrées sur le `Saison_id` du match**, chacune avec `Affectation_id, Personne_id, Role, Slot` et nom affichable résolu (fallback sur `Personne_id` si hors vivier) ; pour `Role=ARBITRE`, `Slot` vaut `1` ou `2`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 10.4, 11.4_

  - [ ]\* 7.2 Tests unitaires du détail de match
    - Lookup d'un match existant (4.1), erreur « match introuvable » (4.3)
    - Affectations retournées limitées au `Saison_id` du match (10.4)
    - _Requirements: 4.1, 4.3, 10.4_

- [x] 8. Implémenter la modification d'un match (écriture sous verrou)
  - [x] 8.1 Implémenter `updateMatch(payload)`
    - `requireRole("ADMIN", "BUREAU")` en premier ; refus → erreur de droits
    - Validation avant verrou : `Match_id` présent ; `Lieu` ∈ `MATCHS_LIEUX` si fourni ; `Categorie` ∈ `MATCHS_CATEGORIES` si fournie
    - `LockService.getScriptLock().waitLock(30000)` puis **relecture** de `Matchs` ; `releaseLock()` dans `finally`
    - Comparaison champ par champ via `normalizeHistoryValue` : si rien ne change → `{ success: true, action: "UNCHANGED", Match_id }` sans écrire
    - Sinon applique les champs modifiables, met `Date_maj = new Date()`, réécrit via `writeObjectsToSheet`, journalise via `logHistorique`, retourne `{ success: true, action: "UPDATED", Match_id }`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 11.1, 11.2, 12.1_

  - [ ]\* 8.2 Tests de propriété et unitaires de `updateMatch`
    - **Property 5: Validation d'appartenance aux ensembles autorisés** — **Validates: Requirements 5.4, 5.5, 11.3**
    - **Property 9: Idempotence de la modification de match** — **Validates: Requirements 5.9**
    - **Property 6: Rejet des paramètres obligatoires manquants** (volet `updateMatch`) — **Validates: Requirements 11.1, 11.2**
    - Test unitaire : COACH refusé en écriture (5.2)

- [x] 9. Implémenter l'affectation d'une personne (arbitre / OTM)
  - [x] 9.1 Implémenter `assignAffectation(matchId, personneId, role)`
    - `requireRole("ADMIN", "BUREAU")` ; validation `matchId`/`personneId`/`role` non vides et `role` ∈ `AFFECTATION_ROLES`
    - Vérifie l'existence du match et récupère son `Saison_id` ; `assertPersonneDansVivier(personneId, role, saisonId)`
    - `waitLock(30000)` + **relecture** de `Affectations_matchs` ; `releaseLock()` dans `finally`
    - Idempotence : triplet `(Match_id, Personne_id, Role)` déjà présent → `{ action: "ALREADY_EXISTS", ... }` sans nouvelle ligne
    - Sinon `getNextAffectationId`, écrit la ligne complète (`Affectation_id, Saison_id, Match_id, Personne_id, Role, Slot, Date_maj`) avec `Slot = ""` (voie générique OTM/modale), journalise `CREATION`, retourne `{ action: "CREATED", ... }`
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 10.1, 10.2, 11.1, 11.2, 11.3, 11.4, 11.5, 12.1_

  - [ ]\* 9.2 Tests de propriété de l'affectation
    - **Property 7: Complétude de l'enregistrement d'affectation** — **Validates: Requirements 6.6, 8.4**
    - **Property 10: Cohérence saisonnière des affectations** — **Validates: Requirements 10.1, 10.2, 10.4**
    - **Property 6: Rejet des paramètres obligatoires manquants** (volet `assignAffectation`) — **Validates: Requirements 11.1, 11.2**

- [ ] 9bis. Implémenter la désignation positionnée d'un arbitre de slot
  - [ ] 9bis.1 Implémenter `setArbitreSlot(matchId, slot, personneId)`
    - `requireRole("ADMIN", "BUREAU")` ; valider `matchId` présent et `slot` ∈ `{1, 2}` (erreur de valeur invalide sinon)
    - Vérifier l'existence du match et récupérer son `Saison_id` ; si `personneId` non vide, `assertPersonneDansVivier(personneId, "ARBITRE", saisonId)`
    - `waitLock(30000)` + **relecture** de `Affectations_matchs` ; `releaseLock()` dans `finally`
    - Idempotence : même arbitre déjà sur ce slot → `{ action: "UNCHANGED" }` sans écriture
    - Interdire le même `personneId` sur l'autre slot du match (erreur explicite)
    - `personneId` vide → libérer le slot (`splice`), `{ action: "CLEARED" }` (ou `UNCHANGED` si déjà vide)
    - Slot occupé par un autre arbitre → **remplacer** (supprimer l'occupant, créer la nouvelle ligne `Slot=1|2`), `{ action: "REPLACED" }` ; slot vide → `{ action: "SET" }`
    - Journaliser `Historique` (SUPPRESSION et/ou CREATION, `Champ = "Slot " + slot`) ; retour explicite `{ success, action, Match_id, Slot, Personne_id, Affectation_id }`
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12, 10.1, 10.2, 11.1, 11.2, 11.5, 12.1_

  - [ ]\* 9bis.2 Tests de propriété de la désignation de slot
    - **Property 14: Unicité et remplacement d'un slot d'arbitre** — **Validates: Requirements 6.6, 6.7**
    - **Property 15: Libération d'un slot d'arbitre** — **Validates: Requirements 6.8, 6.9**
    - **Property 16: Interdiction d'un même arbitre sur les deux slots** — **Validates: Requirements 6.10**
    - **Property 5: Validation d'appartenance aux ensembles autorisés** (volet `Slot`) — **Validates: Requirements 11.5**

- [x] 10. Implémenter le retrait d'une affectation (écriture sous verrou)
  - [x] 10.1 Implémenter `removeAffectation(affectationId)`
    - `requireRole("ADMIN", "BUREAU")` ; validation `affectationId` non vide
    - `waitLock(30000)` + **relecture** de `Affectations_matchs` ; `releaseLock()` dans `finally`
    - Absente → `{ success: true, action: "ALREADY_ABSENT", Affectation_id }` sans erreur
    - Présente → `splice`, réécriture via `writeObjectsToSheet`, journalisation `SUPPRESSION`, retour `{ action: "DELETED", Affectation_id }`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.6, 11.1, 11.2, 12.1_

  - [ ]\* 10.2 Test de propriété round-trip assign/remove
    - **Property 8: Idempotence de l'affectation et round-trip assign/remove** — **Validates: Requirements 6.6, 7.2, 7.3, 8.5**

- [x] 11. Checkpoint backend — Vérifier la fiabilité du backend avant l'interface
  - Exécuter les fonctions `testXxx` et le harnais de propriétés depuis l'éditeur Apps Script
  - S'assurer que toutes les lectures/écritures passent et que les contrôles de droits refusent le COACH en écriture
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 9.1, 9.5_

- [x] 12. Construire l'interface du module (`61_Matchs.html`)
  - [x] 12.1 Créer la structure et le sélecteur de saison
    - Créer `61_Matchs.html` avec `#page-matchs` : header + `#matchs-saison-select`, `.matchs-filters`, `#matchs-summary`, `#matchs-loading`, `#matchs-table-container`, `#matchs-empty`, `#matchs-detail-overlay`
    - Marquer les zones d'état (chargement, vide) et les conteneurs de la modale
    - _Requirements: 2.1_

  - [x] 12.2 Implémenter la logique de liste, saison et filtres
    - Dans un bloc `/* MATCHS */` (à placer dans `92_Scripts.html` à l'étape 13), implémenter `loadMatchsModule()`, `onMatchsSaisonChange()`, `loadMatchs(saisonId)` (appel `listMatchs`), rendu du tableau avec badges de comptage, filtrage client Catégorie/Lieu et bouton « Effacer »
    - Peupler le `<select>` saison via `getActiveSaison()` puis `listSaisons()`, présélection de la saison active ; recharge sur changement
    - Afficher `#matchs-empty` si aucun match
    - _Requirements: 1.1, 1.8, 1.9, 2.1, 2.3, 2.4, 3.1, 3.2, 3.3_

  - [ ] 12.6 Ajouter les colonnes « Arbitre 1 » / « Arbitre 2 » éditables en ligne
    - Ajouter les deux en-têtes et cellules au tableau rendu dans `loadMatchs`
    - Au chargement d'une saison, peupler **une seule fois** `matchsArbitresVivier` via `getArbitresAffectables(saisonId)` (fallback texte seul en cas d'échec)
    - Éditeur : `buildArbitreSlotSelect(match, slot)` rend un `<select class="matchs-arbitre-select">` avec option vide « — Aucun — », une option par arbitre du vivier, présélection de l'occupant (`Arbitre{slot}_id`), option de repli si l'occupant est hors vivier ; poser `data-match-id`, `data-slot`, `data-prev`
    - `onArbitreSlotChange(select)` : état de chargement (classe `matchs-arbitre-saving`, `disabled`), appel `google.script.run.withSuccessHandler().withFailureHandler().setArbitreSlot(matchId, slot, personneId)` ; succès → maj `data-prev` + `matchsData` + retour succès ; échec → message + **rétablir** `data-prev`
    - Non-éditeur (COACH) : rendre les colonnes en texte seul (`Arbitre{slot}_nom`) sans `<select>`
    - _Requirements: 9bis.1, 9bis.2, 9bis.3, 9bis.4, 9bis.5, 9bis.6_

  - [ ]\* 12.3 Test de propriété du filtrage côté interface
    - **Property 4: Filtrage côté interface par prédicat** — **Validates: Requirements 3.1, 3.2, 3.3**

  - [x] 12.4 Implémenter la modale détail/édition et les affectations
    - `openMatchDetail(matchId)` (appel `getMatchDetail`) remplit les champs éditables, affiche les arbitres résolus par `Slot` (lecture) et la liste des OTM avec noms résolus
    - `saveMatchDetail()` appelle `updateMatch(payload)` ; gérer états bouton et messages (`UNCHANGED` → « Aucune modification »)
    - Peupler la liste OTM via `getOtmAffectables` ; si vivier OTM vide, afficher « Module OTM à venir » et désactiver l'ajout, sans bloquer
    - OTM « Ajouter » → `assignAffectation(matchId, personneId, "OTM")` ; « Retirer » → `removeAffectation` ; rafraîchir via `getMatchDetail` au succès (la désignation des arbitres se fait en ligne dans le tableau, étape 12.6)
    - _Requirements: 4.1, 4.2, 4.3, 5.8, 5.9, 7.5, 8.1, 8.7_

  - [x] 12.5 Implémenter le contrôle d'accès cosmétique côté UI
    - `matchsIsEditor()` basé sur `currentUser.role` (`ADMIN`/`BUREAU`)
    - Pour un non-éditeur (COACH) : champs en lecture seule (`disabled`), boutons Enregistrer/Ajouter/Retirer masqués, colonnes « Arbitre 1 » / « Arbitre 2 » rendues en texte seul ; consultation liste + détail conservée
    - _Requirements: 9.2, 9.4, 9bis.6_

- [x] 13. Câbler le module dans l'application
  - [x] 13.1 Ajouter les styles `matchs-*`
    - À la fin de `91_Styles.html`, ajouter les règles préfixées `matchs-*` (header, filters, table, badge, modal-overlay, modal, modal-grid, modal-field) en réutilisant les variables existantes
    - _Requirements: 2.1_

  - [ ] 13.3 Ajouter les styles des sélecteurs d'arbitre en ligne
    - Ajouter `matchs-arbitre-select` (calqué sur le sélecteur d'Arbitrage) et les états transitoires `matchs-arbitre-saving` (chargement) et `matchs-arbitre-error` (échec) sur la cellule concernée
    - _Requirements: 9bis.4, 9bis.5_

  - [x] 13.2 Câbler la navigation et le chargement paresseux
    - Dans `90_Index.html` : ajouter l'entrée de menu `data-page="matchs"` (après Arbitrage) et la section `#page-matchs` incluant `61_Matchs`
    - Dans `92_Scripts.html` : ajouter dans `navigateTo(page)` la branche `if (page === "matchs") { loadMatchsModule(); }` et insérer le bloc JS `/* MATCHS */` (variables `matchsData`, `matchsCurrentSaison`, labels, handlers de l'étape 12)
    - _Requirements: 2.1, 2.3_

- [ ] 14. Checkpoint final — Vérifier l'intégration de bout en bout
  - Vérifier le flux complet : navigation Matchs → liste → filtres → détail → édition → affectation/retrait arbitre et OTM, avec masquage des commandes pour COACH
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 9.1, 9.4, 9.5_

## Notes

- Les tâches marquées `*` sont optionnelles (tests unitaires et de propriété) et peuvent être
  omises pour un MVP ; les tâches de test se font sous forme de fonctions `testXxx` et d'un
  harnais de propriétés en mémoire (pas de runner standard sous Apps Script).
- Chaque tâche référence des sous-exigences précises pour la traçabilité et, le cas échéant,
  les Correctness Properties du design (annotées **Property {n}** + **Validates**).
- Le backend (tâches 1 à 11, dont 9bis) est construit et vérifié avant le frontend
  (tâches 12 à 14), selon le principe « backend fiable avant interface ».
- Les écritures `updateMatch`, `assignAffectation`, `setArbitreSlot`, `removeAffectation`
  partagent le pattern `waitLock(30000)` + relecture + `releaseLock()` dans `finally`.
- La désignation des arbitres se fait **en ligne** dans le tableau (slots 1/2 via
  `setArbitreSlot`, colonne `Slot` de `Affectations_matchs`) ; `assignAffectation` /
  `removeAffectation` restent utilisées pour les OTM et la modale.
- La saisie initiale des matchs reste manuelle dans l'onglet `Matchs` (import FBI/FFBB hors
  périmètre) ; l'étape 2 ne fait qu'initialiser les onglets et leurs en-têtes.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2.1", "3.1"] },
    { "id": 1, "tasks": ["3.2", "3.3", "4.1"] },
    { "id": 2, "tasks": ["3.4", "4.2", "5.1", "6.1", "6.2"] },
    { "id": 3, "tasks": ["5.2", "6.3", "7.1"] },
    { "id": 4, "tasks": ["7.2", "8.1", "10.1"] },
    { "id": 5, "tasks": ["8.2", "9.1", "10.2"] },
    { "id": 6, "tasks": ["5.3"] },
    { "id": 7, "tasks": ["9bis.1"] },
    { "id": 8, "tasks": ["5.4", "9.2", "9bis.2"] },
    { "id": 9, "tasks": ["12.1"] },
    { "id": 10, "tasks": ["12.2", "12.4", "12.5"] },
    { "id": 11, "tasks": ["12.6", "13.1"] },
    { "id": 12, "tasks": ["12.3", "13.2", "13.3"] }
  ]
}
```
