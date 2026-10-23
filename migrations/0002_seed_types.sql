-- Legacy sticker types (BUILD.md §5)
INSERT INTO sticker_types (slug,label,legacy_code,icon_key,sort_order,allows_text,fit) VALUES
 ('papa','Papa','Papa','icons/papa.png',1,0,'contain'),
 ('sexo-punto','Sexo.','Sexo.','icons/sexo-punto.png',2,0,'cover'),
 ('sexo-pregunta','Sexo?','Sexo?','icons/sexo-pregunta.png',3,0,'cover'),
 ('sexo-pregunta-og','Sexo? OG','Sexo? OG','icons/sexo-pregunta-og.png',4,0,'cover'),
 ('otro','Otro','other','icons/otro.png',99,1,'contain');
