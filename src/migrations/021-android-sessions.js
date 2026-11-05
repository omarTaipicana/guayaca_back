import {DataTypes} from 'sequelize';
export const name='021-android-sessions';
export async function up({context:db}){
 await db.getQueryInterface().createTable('android_sessions',{
  digest:{type:DataTypes.STRING(64),primaryKey:true},
  user_id:{type:DataTypes.BIGINT,allowNull:false,references:{model:'users',key:'id'},onDelete:'CASCADE'},
  created_at:{type:DataTypes.DATE,allowNull:false}
 });
}
export async function down({context:db}){await db.getQueryInterface().dropTable('android_sessions');}
