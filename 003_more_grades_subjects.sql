-- Adds missing stages/subjects (safe to re-run: skips names that already exist)
insert into public.grades (name, stage, sort_order)
select v.name, v.stage, v.so from (values
 ('رياض الأطفال KG1','رياض أطفال',-2),('رياض الأطفال KG2','رياض أطفال',-1),
 ('الصف الأول الثانوي','ثانوي',10),('الصف الثاني الثانوي','ثانوي',11),('الصف الثالث الثانوي','ثانوي',12)
) v(name,stage,so) where not exists (select 1 from public.grades g where g.name = v.name);

insert into public.subjects (name, sort_order)
select v.name, v.so from (values
 ('الفيزياء',10),('الكيمياء',11),('الأحياء',12),('التاريخ',13),('الجغرافيا',14),('الفلسفة والمنطق',15),
 ('علم النفس والاجتماع',16),('التربية الدينية',17),('الحاسب الآلي',18),('التربية الفنية',19),('اللغة الفرنسية',20),('اللغة الألمانية',21)
) v(name,so) where not exists (select 1 from public.subjects s where s.name = v.name);

-- subjects.icon held placeholder words from the first seed; the new UI does not use icons
update public.subjects set icon = null;
