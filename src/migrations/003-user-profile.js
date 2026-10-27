import {DataTypes} from 'sequelize';
export const name='003-user-profile';
export async function up({context:sequelize}){
 const qi=sequelize.getQueryInterface();const columns={last_name:{type:DataTypes.STRING(120),allowNull:true},document_number:{type:DataTypes.STRING(30),allowNull:true},birth_date:{type:DataTypes.DATEONLY,allowNull:true},sex:{type:DataTypes.STRING(40),allowNull:true},phone:{type:DataTypes.STRING(30),allowNull:true},photo_filename:{type:DataTypes.STRING(120),allowNull:true},photo_bytes:{type:DataTypes.BIGINT,allowNull:true},setup_pending:{type:DataTypes.BOOLEAN,allowNull:false,defaultValue:false}};
 await sequelize.transaction(async transaction=>{for(const [field,def] of Object.entries(columns))await qi.addColumn('users',field,def,{transaction})});
}
export async function down(){throw new Error('Esta migración no se revierte automáticamente; restaure un respaldo.');}
