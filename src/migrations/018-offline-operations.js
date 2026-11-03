import {DataTypes as D,literal} from 'sequelize';
export const name='018-offline-operations';
export const operationFields={id:{type:D.UUID,primaryKey:true},user_id:{type:D.BIGINT,allowNull:false,references:{model:'users',key:'id'}},trip_id:{type:D.BIGINT,allowNull:false,references:{model:'trips',key:'id'}},kind:{type:D.STRING(20),allowNull:false},request_hash:{type:D.STRING(64),allowNull:false},captured_at:{type:D.DATE,allowNull:false},result:{type:D.JSONB,allowNull:false},confirmed_at:{type:D.DATE,allowNull:false,defaultValue:literal('CURRENT_TIMESTAMP')}};
export async function up({context:db}){await db.transaction(async transaction=>{await db.getQueryInterface().createTable('offline_operations',operationFields,{transaction});await db.getQueryInterface().addIndex('offline_operations',['user_id','trip_id','captured_at'],{transaction});});}
export async function down(){throw Error('Restaure respaldo para revertir.');}
