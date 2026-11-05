import {DataTypes} from 'sequelize';
export const name='020-route-observations';
export async function up({context:db}){
 await db.getQueryInterface().addColumn('gps_samples','route_point',{type:DataTypes.BOOLEAN,allowNull:false,defaultValue:true});
}
export async function down(){throw Error('Restaure un respaldo para revertir esta migración.');}
