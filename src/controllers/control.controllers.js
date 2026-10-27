import {Op,User,Vehicle,Trip,TripEvent,wrap} from '../services/shared.service.js';
export const controlGet=wrap(async(req,res)=>{
 const drivers=await User.findAll({where:{role:'conductor'},attributes:['id','name','last_name','active'],order:[['name','ASC']]});
 const trips=await Trip.findAll({where:{status:{[Op.in]:['creado','en_curso']}},include:[{model:Vehicle,as:'vehicle',attributes:['plate']}],attributes:['id','code','driver_id','status','origin','destination','started_at','created_at'],order:[['id','DESC']]});
 const ids=trips.map(t=>t.id),events=ids.length?await TripEvent.findAll({where:{trip_id:{[Op.in]:ids}},attributes:['trip_id','type','latitude','longitude','accuracy','created_at'],order:[['id','DESC']]}):[];
 const latest=new Map();for(const e of events)if(!latest.has(String(e.trip_id))&&e.latitude!=null&&e.longitude!=null)latest.set(String(e.trip_id),{latitude:e.latitude,longitude:e.longitude,accuracy:e.accuracy,created_at:e.created_at,type:e.type});
 const result=drivers.map(d=>({id:d.id,name:[d.name,d.last_name].filter(Boolean).join(' '),active:d.active,trips:trips.filter(t=>String(t.driver_id)===String(d.id)).map(t=>({id:t.id,code:t.code,status:t.status,origin:t.origin,destination:t.destination,plate:t.vehicle?.plate||'',started_at:t.started_at,created_at:t.created_at,last_location:latest.get(String(t.id))||null}))}));
 res.json({generated_at:new Date(),drivers:result});
});
