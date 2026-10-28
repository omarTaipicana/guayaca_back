import {DataTypes as D, literal} from 'sequelize';
export const name='005-clients-places';
const id=()=>({type:D.BIGINT,primaryKey:true,autoIncrement:true,allowNull:false});
const text=(size,required=false)=>({type:D.STRING(size),allowNull:!required});
const stamp=()=>({type:D.DATE,allowNull:false,defaultValue:literal('CURRENT_TIMESTAMP')});
export const clientFields={id:id(),name:text(180,true),document_number:{...text(13),unique:true},contact_name:text(180),phone:text(40),email:text(180),address:text(500),notes:text(2000),active:{type:D.BOOLEAN,allowNull:false,defaultValue:true},created_at:stamp(),updated_at:stamp()};
export const placeFields={id:id(),name:text(180,true),type:text(20,true),representative:text(180),document_number:text(13),phone:text(40),email:text(180),address:text(500,true),notes:text(2000),latitude:{type:D.DECIMAL(10,7),allowNull:false},longitude:{type:D.DECIMAL(10,7),allowNull:false},radius_m:{type:D.INTEGER,allowNull:false,defaultValue:150},territory:{type:D.JSONB,allowNull:false,defaultValue:{}},active:{type:D.BOOLEAN,allowNull:false,defaultValue:true},created_at:stamp(),updated_at:stamp()};
export async function up({context:db}){const qi=db.getQueryInterface();await db.transaction(async transaction=>{
 await qi.createTable('clients',clientFields,{transaction});await qi.createTable('places',placeFields,{transaction});
 await qi.addIndex('clients',['active','name'],{transaction});await qi.addIndex('places',['active','type','name'],{transaction});
 await db.query("ALTER TABLE places ADD CONSTRAINT place_type_valid CHECK (type IN ('embarque','entrega','ambos')), ADD CONSTRAINT place_coordinates_valid CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180), ADD CONSTRAINT place_radius_valid CHECK (radius_m BETWEEN 25 AND 5000)",{transaction});
});}
export async function down(){throw Error('Restaure un respaldo para revertir esta migración.');}
