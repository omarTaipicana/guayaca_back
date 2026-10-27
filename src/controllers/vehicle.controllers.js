import { Vehicle, wrap, fail, audit } from "../services/shared.service.js";
export const vehiclesGet = wrap(async (req, res) =>
  res.json(await Vehicle.findAll({ order: [["plate", "ASC"]] })),
);
export const vehiclesPost = wrap(async (req, res) => {
  let plate = String(req.body.plate || "")
    .trim()
    .toUpperCase();
  if (!plate) fail(400, "Ingrese la placa");
  let v = await Vehicle.create({
    plate,
    description: String(req.body.description || ""),
  });
  await audit(req.user, "crear_vehiculo", { vehicle_id: v.id });
  res.json(v);
});
