import {DataTypes} from 'sequelize';
export const name='013-initial-odometer';
export async function up({context:db}){await db.transaction(async transaction=>{await db.getQueryInterface().addColumn('vehicles','initial_odometer',{type:DataTypes.DECIMAL(12,1),allowNull:true},{transaction});await db.getQueryInterface().addColumn('vehicles','initial_odometer_at',{type:DataTypes.DATE,allowNull:true},{transaction});});}
export async function down(){throw Error('Restaure un respaldo para revertir.');}
