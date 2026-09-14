-- Local/dev seed. Reference data for London is imported by scripts/import_tfl.ts.
insert into public.cities (id, slug, name, country_code, centre_lat, centre_lon)
values ('00000000-0000-0000-0000-000000000001', 'london', 'London', 'GB', 51.5072, -0.1276)
on conflict (id) do nothing;
