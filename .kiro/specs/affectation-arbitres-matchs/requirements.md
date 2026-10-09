# Requirements Document

## Introduction

Ce document définit les exigences du module **Matchs** de l'application US Aussonne Basket (Google Apps Script Web App, Google Sheets comme base de données). Le module répond au besoin métier décrit dans la documentation (section 13) : « Qui arbitre quel match ? ».

Le module affiche la liste des matchs de la saison active, permet de consulter et modifier les données propres à chaque match (lieu, score, responsable de salle, etc.), et permet d'affecter ou de retirer des personnes sur un match selon un rôle (arbitre, OTM, responsable de salle). Le vivier des arbitres provient du module Arbitrage existant ; le vivier des OTM proviendra du module OTM.

Le tableau de la liste des matchs expose deux colonnes dédiées « Arbitre 1 » et « Arbitre 2 » : les noms des arbitres y sont affichés directement et, pour un utilisateur éditeur, éditables **en ligne** via des listes déroulantes à sauvegarde immédiate au changement (même interaction que les sélecteurs en ligne des modules Arbitrage et Adhésions). Cette édition rapide s'ajoute à la modale de détail, qui reste disponible pour l'édition fine du match et pour l'affectation des OTM.

Le module suit les conventions du projet : fichiers backend `60_Matchs.js` et frontend `61_Matchs.html` (le module OTM occupant la numérotation 50), accès aux colonnes par nom d'en-tête, écritures protégées par `LockService`, sérialisation ISO des dates vers le client, contrôle des droits côté serveur et rattachement systématique des données saisonnières à un `Saison_id`.

La saisie initiale des matchs se fait **manuellement** dans le classeur Sheets. L'import automatique depuis FBI/FFBB est **hors périmètre** : le module suppose que les données de base des matchs existent déjà dans la table `Matchs` et se concentre sur leur affichage, leur modification et la gestion des affectations.

Le modèle d'affectations est **générique** (une table `Affectations_matchs` avec un champ `Role`) conformément à la recommandation de la documentation d'éviter des colonnes `Arbitre_1`, `OTM_1`, etc. dans la table `Matchs`. Une colonne `Slot` complète ce modèle pour les affectations d'arbitres : elle positionne l'arbitre sur le match (`1` = Arbitre 1, `2` = Arbitre 2) sans multiplier les colonnes dans la table `Matchs`.

## Glossary

- **Module_Matchs**: Ensemble des fonctions backend (`60_Matchs.js`) et de l'interface (`61_Matchs.html`) couvrant la consultation des matchs, l'édition des données de match et la gestion des affectations.
- **Backend_Matchs**: Partie serveur du Module_Matchs exécutée sous Google Apps Script.
- **Interface_Matchs**: Partie frontend du Module_Matchs rendue dans le navigateur.
- **Classeur_Sport**: Classeur Google Sheets `SPORT` défini dans `00_Config.js` (`SPREADSHEETS.SPORT`).
- **Classeur_Adhesions**: Classeur Google Sheets `ADHESIONS` défini dans `00_Config.js` (`SPREADSHEETS.ADHESIONS`).
- **Table_Matchs**: Feuille `Matchs` du Classeur_Sport, contenant uniquement les données propres à un match.
- **Table_Affectations**: Feuille `Affectations_matchs` du Classeur_Sport, table générique reliant une personne à un match pour un rôle donné.
- **Table_Saisons**: Feuille `Saisons` du Classeur_Adhesions, contenant les saisons et leur indicateur `Active`.
- **Table_Arbitrage**: Feuille `Arbitrage` du Classeur_Sport, source du vivier des arbitres (fonction `getArbitres`).
- **Table_OTM**: Feuille source du vivier des OTM, gérée par le module OTM (fichiers `50_OTM.js` / `50_OTM.html`).
- **Table_Historique**: Feuille `Historique` du Classeur_Adhesions, utilisée pour la traçabilité des modifications importantes.
- **Match**: Rencontre sportive d'une équipe du club, identifiée par `Match_id` et rattachée à une saison.
- **Match_id**: Identifiant interne stable d'un match, de la forme `MAT-` suivi d'un numéro à six chiffres (ex. `MAT-000001`).
- **Affectation**: Association d'une personne à un Match pour un rôle donné, identifiée par `Affectation_id` et rattachée à une saison.
- **Affectation_id**: Identifiant interne stable d'une affectation, de la forme `AFF-` suivi d'un numéro à six chiffres (ex. `AFF-000001`).
- **Personne_id**: Identifiant d'une personne affectée. Pour un arbitre, il correspond à l'`Arbitre_id` de la Table_Arbitrage ; pour un OTM, à l'identifiant fourni par le module OTM.
- **Role_affectation**: Valeur technique du rôle d'une affectation parmi `ARBITRE`, `OTM`, `RESPONSABLE_SALLE`.
- **Slot_arbitre**: Position d'un arbitre sur un match, valeur `1` ou `2`, identifiant respectivement « Arbitre 1 » et « Arbitre 2 ». Stockée dans la colonne `Slot` de la Table_Affectations. Un slot donné héberge au plus un arbitre. Pour les rôles sans position suivie (OTM) ou le `RESPONSABLE_SALLE`, le `Slot` est vide ou `0`.
- **Colonne_Arbitre**: Colonne du tableau des matchs de l'Interface_Matchs affichant et permettant d'éditer en ligne l'arbitre d'un `Slot_arbitre` donné (« Arbitre 1 » pour le slot `1`, « Arbitre 2 » pour le slot `2`).
- **Saison_active**: Saison dont la valeur `Active` vaut `Oui` dans la Table_Saisons.
- **Saison_id**: Identifiant d'une saison (ex. `2026-2027`).
- **Utilisateur**: Personne connectée à l'application, identifiée par son compte Google et son rôle applicatif (`ADMIN`, `BUREAU`, `COACH`).
- **Role_editeur**: Rôle applicatif autorisé à modifier les données (`ADMIN` ou `BUREAU`).
- **Lieu_match**: Lieu d'un match parmi `PIERRE_DENIS`, `GERMAINE_TILLON`, `EXTERIEUR`.
- **Categorie_match**: Catégorie d'un match, réutilisant les catégories du module Arbitrage (`U13F`, `U13M`, `U15F`, `U15M`, `U18F`, `U18M`, `SENIORS_F`, `SENIORS_M`).

## Requirements

### Requirement 1 — Lister les matchs de la saison sélectionnée

**User Story:** En tant que membre du bureau, je veux voir la liste des matchs d'une saison, afin de piloter les affectations d'arbitres et d'OTM.

#### Acceptance Criteria

1. WHEN l'Interface_Matchs est ouverte, THE Backend_Matchs SHALL déterminer la Saison_active à partir de la Table_Saisons et retourner cette saison à l'Interface_Matchs.
2. WHEN l'Interface_Matchs demande les matchs pour un Saison_id, THE Backend_Matchs SHALL retourner les enregistrements de la Table_Matchs dont le `Saison_id` est égal au Saison_id demandé.
3. THE Backend_Matchs SHALL accéder aux colonnes de la Table_Matchs par nom d'en-tête.
4. THE Backend_Matchs SHALL convertir chaque valeur de type date en chaîne au format ISO 8601 avant de la retourner à l'Interface_Matchs.
5. WHEN le Backend_Matchs retourne la liste des matchs, THE Backend_Matchs SHALL inclure pour chaque Match le nombre d'affectations existantes par Role_affectation.
6. WHEN le Backend_Matchs retourne la liste des matchs, THE Backend_Matchs SHALL inclure pour chaque Match, pour le Slot_arbitre `1` et pour le Slot_arbitre `2`, le `Personne_id` de l'arbitre occupant le slot et son nom affichable, ou une valeur vide lorsque le slot est inoccupé.
7. WHEN le Backend_Matchs résout le nom affichable d'un arbitre de slot, THE Backend_Matchs SHALL utiliser le vivier des arbitres de la Table_Arbitrage et, IF le `Personne_id` n'y figure plus, THEN THE Backend_Matchs SHALL retourner le `Personne_id` comme valeur de repli.
8. IF aucun match n'existe pour le Saison_id demandé, THEN THE Interface_Matchs SHALL afficher un état vide indiquant l'absence de match pour la saison.
9. WHERE l'Utilisateur sélectionne une saison différente de la Saison_active, THE Backend_Matchs SHALL utiliser le Saison_id sélectionné pour toutes les lectures de la page.

### Requirement 2 — Sélectionner la saison de travail

**User Story:** En tant qu'utilisateur, je veux voir et choisir la saison affichée, afin de consulter les matchs de la saison en cours ou d'une saison antérieure.

#### Acceptance Criteria

1. WHEN l'Interface_Matchs est ouverte, THE Interface_Matchs SHALL afficher la saison de travail courante.
2. WHEN l'Interface_Matchs demande la liste des saisons, THE Backend_Matchs SHALL retourner les enregistrements de la Table_Saisons avec leur `Saison_id`, leur libellé et leur indicateur `Active`.
3. WHEN l'Utilisateur sélectionne une saison dans la liste, THE Interface_Matchs SHALL recharger les matchs pour le Saison_id sélectionné.
4. THE Backend_Matchs SHALL déterminer la saison à partir de la Table_Saisons ou de la sélection de l'Utilisateur, sans valeur de saison codée en dur.

### Requirement 3 — Filtrer la liste des matchs

**User Story:** En tant que membre du bureau, je veux filtrer les matchs, afin de retrouver rapidement les rencontres concernées.

#### Acceptance Criteria

1. WHERE l'Utilisateur applique un filtre par Categorie_match, THE Interface_Matchs SHALL afficher uniquement les matchs dont la catégorie correspond au filtre.
2. WHERE l'Utilisateur applique un filtre par Lieu_match, THE Interface_Matchs SHALL afficher uniquement les matchs dont le lieu correspond au filtre.
3. WHEN l'Utilisateur efface les filtres, THE Interface_Matchs SHALL afficher l'ensemble des matchs du Saison_id courant.

### Requirement 4 — Consulter le détail d'un match

**User Story:** En tant qu'utilisateur, je veux consulter les informations d'un match et ses affectations, afin de connaître l'état d'organisation de la rencontre.

#### Acceptance Criteria

1. WHEN l'Interface_Matchs demande le détail d'un Match par Match_id, THE Backend_Matchs SHALL retourner les données du Match correspondant issues de la Table_Matchs.
2. WHEN le Backend_Matchs retourne le détail d'un Match, THE Backend_Matchs SHALL inclure la liste des Affectations de ce Match avec, pour chacune, l'`Affectation_id`, le `Personne_id`, le `Role_affectation`, le `Slot` et le nom affichable de la personne.
3. WHEN le Role_affectation d'une Affectation retournée dans le détail est `ARBITRE`, THE Backend_Matchs SHALL inclure la valeur de `Slot_arbitre` associée à cette Affectation.
4. IF le Match_id demandé n'existe pas pour le Saison_id courant, THEN THE Backend_Matchs SHALL lever une erreur indiquant que le match est introuvable.

### Requirement 5 — Modifier les données d'un match

**User Story:** En tant que membre du bureau, je veux modifier les données d'un match (lieu, score, responsable de salle et autres champs modifiables), afin de tenir à jour les informations de la rencontre.

#### Acceptance Criteria

1. WHEN un Role_editeur enregistre une modification de Match, THE Backend_Matchs SHALL vérifier les droits de l'Utilisateur par `requireRole("ADMIN", "BUREAU")` avant toute écriture.
2. IF l'Utilisateur ne possède pas un Role_editeur, THEN THE Backend_Matchs SHALL refuser la modification et lever une erreur de droits.
3. WHEN un Role_editeur enregistre une modification de Match, THE Backend_Matchs SHALL vérifier que le `Match_id` est fourni et existe dans la Table_Matchs.
4. IF le `Lieu_match` fourni n'appartient pas à l'ensemble `PIERRE_DENIS`, `GERMAINE_TILLON`, `EXTERIEUR`, THEN THE Backend_Matchs SHALL refuser la modification et lever une erreur de valeur invalide.
5. IF la `Categorie_match` fournie n'appartient pas à l'ensemble des catégories autorisées, THEN THE Backend_Matchs SHALL refuser la modification et lever une erreur de valeur invalide.
6. WHEN un Role_editeur enregistre une modification de Match, THE Backend_Matchs SHALL acquérir un verrou via `LockService` et relire la Table_Matchs après l'acquisition du verrou avant d'écrire.
7. WHEN le Backend_Matchs enregistre une modification de Match, THE Backend_Matchs SHALL mettre à jour le champ `Date_maj` du Match avec l'horodatage courant.
8. WHEN le Backend_Matchs a enregistré une modification de Match, THE Backend_Matchs SHALL retourner à l'Interface_Matchs un résultat explicite contenant l'issue de l'opération et le `Match_id` concerné.
9. WHEN le Backend_Matchs enregistre une modification de Match avec des valeurs identiques aux valeurs courantes, THE Backend_Matchs SHALL retourner un résultat indiquant qu'aucune modification n'a été appliquée.

### Requirement 6 — Affecter un arbitre à un slot de match (édition en ligne)

**User Story:** En tant que membre du bureau, je veux désigner directement l'arbitre d'un slot (« Arbitre 1 » ou « Arbitre 2 ») depuis le tableau des matchs, afin de piloter rapidement qui arbitre la rencontre sans ouvrir la modale.

#### Acceptance Criteria

1. WHEN l'Interface_Matchs demande la liste des arbitres affectables, THE Backend_Matchs SHALL retourner le vivier des arbitres de la Table_Arbitrage pour le Saison_id courant.
2. WHEN un Role_editeur fixe l'arbitre d'un Slot_arbitre d'un Match, THE Backend_Matchs SHALL vérifier les droits de l'Utilisateur par `requireRole("ADMIN", "BUREAU")` avant toute écriture.
3. WHEN un Role_editeur fixe l'arbitre d'un Slot_arbitre d'un Match, THE Backend_Matchs SHALL vérifier que le `Match_id` fourni existe dans la Table_Matchs pour le Saison_id courant.
4. IF la valeur de `Slot_arbitre` fournie n'appartient pas à l'ensemble `{1, 2}`, THEN THE Backend_Matchs SHALL refuser l'opération et lever une erreur de valeur invalide.
5. WHERE le `Personne_id` fourni est non vide, THE Backend_Matchs SHALL vérifier que ce `Personne_id` existe dans le vivier des arbitres pour le Saison_id courant.
6. WHEN un Role_editeur fixe un arbitre non vide sur un Slot_arbitre, THE Backend_Matchs SHALL enregistrer dans la Table_Affectations une ligne avec un `Affectation_id` généré, le `Saison_id` du Match, le `Match_id`, le `Personne_id`, le `Role_affectation` égal à `ARBITRE`, le `Slot` égal au Slot_arbitre fourni et un `Date_maj` horodaté.
7. WHILE le Slot_arbitre ciblé est déjà occupé par un arbitre différent, THE Backend_Matchs SHALL remplacer l'occupant précédent de ce slot par le nouvel arbitre, de sorte qu'un Slot_arbitre héberge au plus un arbitre.
8. WHERE le `Personne_id` fourni est vide, THE Backend_Matchs SHALL libérer le Slot_arbitre ciblé en retirant l'Affectation d'arbitre qui l'occupe.
9. IF l'arbitre fourni occupe déjà le Slot_arbitre ciblé du Match, THEN THE Backend_Matchs SHALL retourner un résultat indiquant qu'aucune modification n'a été appliquée, sans écriture.
10. IF le `Personne_id` fourni est déjà affecté comme `ARBITRE` sur l'autre Slot_arbitre du même Match, THEN THE Backend_Matchs SHALL refuser l'opération et lever une erreur indiquant qu'un arbitre ne peut pas occuper les deux slots du même Match.
11. WHEN le Backend_Matchs fixe l'arbitre d'un Slot_arbitre, THE Backend_Matchs SHALL acquérir un verrou via `LockService` et relire la Table_Affectations après l'acquisition du verrou avant de générer l'`Affectation_id` et d'écrire.
12. WHEN le Backend_Matchs a fixé l'arbitre d'un Slot_arbitre, THE Backend_Matchs SHALL retourner à l'Interface_Matchs un résultat explicite contenant l'issue de l'opération, le `Match_id`, le `Slot` et le `Personne_id` concernés.

### Requirement 7 — Retirer un arbitre d'un match

**User Story:** En tant que membre du bureau, je veux retirer une affectation d'arbitre, afin de corriger une désignation.

#### Acceptance Criteria

1. WHEN un Role_editeur retire une Affectation, THE Backend_Matchs SHALL vérifier les droits de l'Utilisateur par `requireRole("ADMIN", "BUREAU")` avant toute écriture.
2. WHEN un Role_editeur retire une Affectation par `Affectation_id`, THE Backend_Matchs SHALL supprimer de la Table_Affectations la ligne correspondant à cet `Affectation_id`.
3. IF l'`Affectation_id` fourni n'existe pas dans la Table_Affectations, THEN THE Backend_Matchs SHALL retourner un résultat indiquant que l'affectation est déjà absente.
4. WHEN un Role_editeur retire une Affectation, THE Backend_Matchs SHALL acquérir un verrou via `LockService` et relire la Table_Affectations après l'acquisition du verrou avant de supprimer.
5. WHEN le Backend_Matchs a retiré une Affectation, THE Backend_Matchs SHALL retourner à l'Interface_Matchs un résultat explicite contenant l'issue de l'opération et l'`Affectation_id` concerné.

### Requirement 8 — Affecter et retirer un OTM

**User Story:** En tant que membre du bureau, je veux affecter ou retirer un OTM sur un match, afin de désigner les officiels de table de marque.

#### Acceptance Criteria

1. WHEN l'Interface_Matchs demande la liste des OTM affectables, THE Backend_Matchs SHALL retourner le vivier des OTM issu de la Table_OTM pour le Saison_id courant.
2. WHEN un Role_editeur affecte un OTM à un Match, THE Backend_Matchs SHALL vérifier les droits de l'Utilisateur par `requireRole("ADMIN", "BUREAU")` avant toute écriture.
3. WHEN un Role_editeur affecte un OTM à un Match, THE Backend_Matchs SHALL vérifier que le `Match_id` fourni existe pour le Saison_id courant et que le `Personne_id` fourni existe dans le vivier des OTM pour le Saison_id courant.
4. WHEN le Backend_Matchs crée une Affectation d'OTM, THE Backend_Matchs SHALL enregistrer dans la Table_Affectations une ligne avec un `Affectation_id` généré, le `Saison_id` courant, le `Match_id`, le `Personne_id`, le `Role_affectation` égal à `OTM` et un `Date_maj` horodaté.
5. IF une Affectation existe déjà pour le même `Match_id`, le même `Personne_id` et le `Role_affectation` `OTM`, THEN THE Backend_Matchs SHALL conserver une seule affectation et retourner un résultat indiquant que l'affectation existe déjà.
6. WHEN un Role_editeur retire une Affectation d'OTM par `Affectation_id`, THE Backend_Matchs SHALL supprimer la ligne correspondante de la Table_Affectations sous verrou `LockService`.
7. WHERE le module OTM n'est pas encore disponible, THE Backend_Matchs SHALL retourner un vivier d'OTM vide sans provoquer d'erreur à l'ouverture de l'Interface_Matchs.

### Requirement 9 — Contrôle d'accès basé sur les rôles

**User Story:** En tant que club, je veux que seuls les administrateurs et le bureau puissent modifier les matchs et les affectations, afin de protéger l'intégrité des données.

#### Acceptance Criteria

1. THE Backend_Matchs SHALL exécuter `requireAuthorizedUser` ou `requireRole` au début de chaque fonction accédant à la Table_Matchs ou à la Table_Affectations.
2. WHERE l'Utilisateur possède le rôle `COACH`, THE Backend_Matchs SHALL autoriser la consultation des matchs et des affectations en lecture seule.
3. IF un Utilisateur de rôle `COACH` tente une modification de Match ou une opération d'affectation, THEN THE Backend_Matchs SHALL refuser l'opération et lever une erreur de droits.
4. WHERE l'Utilisateur ne possède pas un Role_editeur, THE Interface_Matchs SHALL masquer ou désactiver les commandes de modification et d'affectation.
5. THE Backend_Matchs SHALL appliquer le contrôle des droits côté serveur indépendamment de l'état des commandes affichées dans l'Interface_Matchs.

### Requirement 9bis — Édition en ligne des arbitres dans le tableau des matchs

**User Story:** En tant que membre du bureau, je veux voir et modifier les arbitres directement dans le tableau des matchs via deux colonnes « Arbitre 1 » et « Arbitre 2 », afin d'affecter les arbitres sans ouvrir la modale.

#### Acceptance Criteria

1. WHEN l'Interface_Matchs affiche le tableau des matchs, THE Interface_Matchs SHALL présenter deux Colonne_Arbitre dédiées, « Arbitre 1 » pour le Slot_arbitre `1` et « Arbitre 2 » pour le Slot_arbitre `2`.
2. WHERE l'Utilisateur possède un Role_editeur, THE Interface_Matchs SHALL rendre chaque Colonne_Arbitre sous forme d'une liste déroulante peuplée du vivier des arbitres affectables pour le Saison_id courant et d'une option vide « — Aucun — », avec l'occupant courant du slot présélectionné.
3. WHEN l'Utilisateur modifie la valeur d'une liste déroulante de Colonne_Arbitre, THE Interface_Matchs SHALL appeler immédiatement le Backend_Matchs pour fixer l'arbitre du Slot_arbitre correspondant, sans action de validation supplémentaire.
4. WHILE un appel de sauvegarde en ligne d'une Colonne_Arbitre est en cours, THE Interface_Matchs SHALL afficher un retour de chargement sur la ligne concernée puis un retour de succès ou d'erreur à l'issue de l'appel.
5. IF l'appel de sauvegarde en ligne échoue, THEN THE Interface_Matchs SHALL afficher le message d'erreur et rétablir la liste déroulante sur la valeur précédemment enregistrée.
6. WHERE l'Utilisateur ne possède pas un Role_editeur, THE Interface_Matchs SHALL rendre chaque Colonne_Arbitre en texte seul (nom affichable de l'arbitre ou valeur vide), sans liste déroulante éditable.

### Requirement 10 — Cohérence saisonnière des données

**User Story:** En tant que club, je veux que chaque match et chaque affectation soient rattachés à une saison, afin de produire des statistiques fiables par saison.

#### Acceptance Criteria

1. THE Backend_Matchs SHALL enregistrer un `Saison_id` sur chaque ligne créée dans la Table_Matchs et dans la Table_Affectations.
2. WHEN le Backend_Matchs crée une Affectation, THE Backend_Matchs SHALL utiliser le `Saison_id` du Match auquel l'Affectation est rattachée.
3. THE Backend_Matchs SHALL utiliser de manière cohérente le Saison_id de la page pour l'ensemble des lectures et écritures d'une même opération.
4. WHEN le Backend_Matchs lit les affectations d'un Match, THE Backend_Matchs SHALL ne retourner que les affectations dont le `Saison_id` correspond au Saison_id du Match.

### Requirement 11 — Validation backend des entrées

**User Story:** En tant que développeur, je veux que le backend valide toutes les entrées, afin d'éviter la corruption des données malgré les contrôles de l'interface.

#### Acceptance Criteria

1. WHEN le Backend_Matchs reçoit une requête d'écriture, THE Backend_Matchs SHALL vérifier la présence de chaque paramètre obligatoire avant toute écriture.
2. IF un paramètre obligatoire est absent ou vide, THEN THE Backend_Matchs SHALL refuser l'opération et lever une erreur indiquant le paramètre manquant.
3. WHEN le Backend_Matchs reçoit un `Role_affectation`, THE Backend_Matchs SHALL vérifier que la valeur appartient à l'ensemble `ARBITRE`, `OTM`, `RESPONSABLE_SALLE`.
4. WHEN le Backend_Matchs reçoit un `Match_id` ou un `Personne_id`, THE Backend_Matchs SHALL vérifier l'existence de la référence avant d'enregistrer une Affectation.
5. WHEN le Backend_Matchs reçoit une valeur de `Slot_arbitre`, THE Backend_Matchs SHALL vérifier que la valeur appartient à l'ensemble `{1, 2}` avant d'enregistrer une Affectation d'arbitre liée à un slot.
6. WHEN le Backend_Matchs génère un identifiant interne, THE Backend_Matchs SHALL produire une valeur stable et unique au format préfixe plus numéro à six chiffres.

### Requirement 12 — Traçabilité des modifications

**User Story:** En tant que club, je veux conserver une trace des modifications importantes sur les matchs et les affectations, afin de savoir qui a fait quoi et quand.

#### Acceptance Criteria

1. WHEN le Backend_Matchs enregistre une modification de Match ou une opération d'affectation, THE Backend_Matchs SHALL enregistrer dans la Table_Historique l'Utilisateur, le module, l'objet, la référence, l'action, le champ concerné, l'ancienne valeur et la nouvelle valeur.
2. WHEN le Backend_Matchs écrit une entrée d'historique, THE Backend_Matchs SHALL horodater l'entrée avec la date et l'heure de l'opération.
