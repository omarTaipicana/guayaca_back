import {DataTypes} from 'sequelize';
export const name='002-vehicle-details';
export async function up({context:sequelize}) {
 const qi=sequelize.getQueryInterface();
 const columns={brand:{type:DataTypes.STRING(120),allowNull:true},model:{type:DataTypes.STRING(120),allowNull:true},model_year:{type:DataTypes.INTEGER,allowNull:true},chassis_number:{type:DataTypes.STRING(120),allowNull:true},engine_number:{type:DataTypes.STRING(120),allowNull:true},capacity_tons:{type:DataTypes.DECIMAL(10,2),allowNull:true},color:{type:DataTypes.STRING(80),allowNull:true},photo_filename:{type:DataTypes.STRING(120),allowNull:true},photo_bytes:{type:DataTypes.BIGINT,allowNull:true}};
 await sequelize.transaction(async transaction=>{for(const [name,definition] of Object.entries(columns))await qi.addColumn('vehicles',name,definition,{transaction});});
}
export async function down(){throw new Error('La migración no se revierte automáticamente; restaure un respaldo si necesita volver atrás.');}
