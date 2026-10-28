import {DataTypes} from 'sequelize';
export const name='004-zone-rates';
export async function up({context:db}) {
 const qi=db.getQueryInterface();
 await db.transaction(async transaction=>{
  await qi.createTable('tonnage_categories', {id:{type:DataTypes.INTEGER,autoIncrement:true,primaryKey:true},name:{type:DataTypes.STRING(100),allowNull:false},min_tons:{type:DataTypes.DECIMAL(10,3),allowNull:false},max_tons:{type:DataTypes.DECIMAL(10,3),allowNull:true},active:{type:DataTypes.BOOLEAN,allowNull:false,defaultValue:true}}, {transaction});
  await db.query(`ALTER TABLE tonnage_categories ADD CONSTRAINT tonnage_valid CHECK (min_tons >= 0 AND (max_tons IS NULL OR max_tons > min_tons))`,{transaction});
  await qi.createTable('zone_rates',{id:{type:DataTypes.INTEGER,autoIncrement:true,primaryKey:true},territory_id:{type:DataTypes.UUID,allowNull:false},category_id:{type:DataTypes.INTEGER,allowNull:false,references:{model:'tonnage_categories',key:'id'}},amount:{type:DataTypes.DECIMAL(12,2),allowNull:false},active:{type:DataTypes.BOOLEAN,allowNull:false,defaultValue:true}},{transaction});
  await qi.addIndex('zone_rates',['territory_id','category_id'],{unique:true,transaction});
  await db.query('ALTER TABLE zone_rates ADD CONSTRAINT zone_amount_valid CHECK (amount >= 0)',{transaction});
 });
}
export async function down(){throw Error('Restaure un respaldo para revertir esta migración.');}
