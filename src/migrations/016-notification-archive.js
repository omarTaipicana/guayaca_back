import {DataTypes as D} from 'sequelize';
export const name='016-notification-archive';
export const stateFields={user_id:{type:D.BIGINT,primaryKey:true,allowNull:false,references:{model:'users',key:'id'}},kind:{type:D.STRING(20),primaryKey:true,allowNull:false},notification_id:{type:D.BIGINT,primaryKey:true,allowNull:false},read_at:{type:D.DATE},archived_at:{type:D.DATE}};
export async function up({context:db}){await db.transaction(async transaction=>{await db.getQueryInterface().createTable('notification_states',stateFields,{transaction});await db.getQueryInterface().addIndex('notification_states',['user_id','kind','archived_at'],{transaction});});}
export async function down(){throw Error('Restaure respaldo para revertir.');}
