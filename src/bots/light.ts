import { Platform } from '../lib/connection';
import { ComponentType, PropertyDataType } from '../lib/type';

async function main() {
  const plat = new Platform('BOT-91JK123', 'martas', 'Světlo');
  const nodeLight = plat.addNode('light', 'Světlo', ComponentType.switch);
  nodeLight.addProperty({
    propertyId: 'power',
    dataType: PropertyDataType.boolean,
    name: 'Světlo',
    settable: true,
  });

  // nodeLight.addProperty({
  //     propertyId: "current",
  //     dataType: PropertyDataType.integer,
  //     name: "Proud",
  //     settable: true,
  //     format: "0:16"
  // })

  // nodeLight.addProperty({
  //     propertyId: "kill",
  //     dataType: PropertyDataType.boolean,
  //     name: "Zabít",
  //     settable: true
  // })

  // const node = plat.addNode("center", "Centrum", ComponentType.generic);
  // node.addProperty({
  //     name: "Displej",
  //     propertyId: "currency",
  //     dataType: PropertyDataType.enum,
  //     format: "BTC,EUR,CZK,ETH",
  //     settable: true,
  //     callback: (prop) => console.log("currency is", prop.value)
  // });

  // plat.addSensor({
  //     name: "Aktuální teplota",
  //     propertyId: "rate",
  //     dataType: PropertyDataType.float,
  //     unitOfMeasurement: "°C",
  // })

  // node.addProperty({
  //     name: "Poměr",
  //     propertyId: "percentage",
  //     dataType: PropertyDataType.integer,
  //     unitOfMeasurement: "%",
  //     format: "0:100",
  //     settable: true,
  //     callback: (prop) => console.log("percentage is", prop.value)
  // });

  // node.addProperty({
  //     name: "Číslo",
  //     propertyId: "numbers",
  //     dataType: PropertyDataType.integer,
  //     settable: true,
  //     callback: (prop) => console.log("numbers is", prop.value)
  // });

  // node.addProperty({
  //     name: "Text",
  //     propertyId: "strings",
  //     dataType: PropertyDataType.string,
  //     settable: true,
  //     callback: (prop) => console.log("strings is", prop.value)
  // });

  // function sendRate() {
  //     plat.publishSensorData(
  //         "rate",
  //         (Math.random() * 10).toFixed(2).toString()
  //     );
  // }

  // plat.publishData("volt", "11");
  plat.on('connect', (client) => {
    console.log('sending data');
    // plat.publishSensorData("volt", "11");
    // plat.publishSensorData("temp", "21.1");
    // plat.publishSensorData("hum", "74");
    // plat.publishSensorData("power", "0");

    // plat.publishData('light', 'power', 'true');

    // sendRate();
    // setInterval(sendRate, 2000);
    // plat.publishData('center', 'currency', 'ETH');
  });
  plat.init();
}

main();
