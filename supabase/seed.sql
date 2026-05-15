insert into public.tags (slug, name, description)
values
  ('vibe-coding', 'Vibe Coding', 'AI coding workflow notes and methodology.'),
  ('trae-solo', 'Trae Solo', 'Trae Solo usage notes and experiments.'),
  ('projects', '项目', 'Project writeups and retrospectives.'),
  ('pitfalls', '踩坑', 'Pitfalls, debugging notes, and hard-won lessons.')
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description;
