-- V6.6 - Ajouter l'assignation des tâches aux employés
alter table tasks add column if not exists assigned_to uuid references auth.users(id);

-- Optionnel: donner les tâches existantes à Jesse si elles n'ont pas d'assignation
-- update tasks set assigned_to = created_by where assigned_to is null;
