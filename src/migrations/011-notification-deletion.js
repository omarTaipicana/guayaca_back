import {DataTypes} from 'sequelize';
export const name='011-notification-deletion';
export async function up({context:db}){await db.transaction(async transaction=>{for(const table of ['notifications','operational_notifications'])await db.getQueryInterface().addColumn(table,'deleted_at',{type:DataTypes.DATE,allowNull:true},{transaction});});}
export async function down(){throw Error('Restaure un respaldo para revertir.');}
