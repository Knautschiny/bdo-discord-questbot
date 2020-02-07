
const Discord = require("discord.js");
const moment = require("moment");
const format = require("./format");
const fs = require("fs");
const Enmap = require("enmap");
const QuestData = require("./QuestData.js");

const interval = 60000
const rChan = new RegExp(/<#(\d+)>/);

const lists = new Enmap({name: "quests"});
const messages = new Enmap({name: "messages"});
for (var [id, quests] of lists.entries()) {
    quests.forEach(v => v.end = moment(v.end));
}


function getMissions(words){
    return QuestData.missions.filter(([desc, count]) => {
        const descWords = desc.split(/\s+/).map((v, _) => v.toUpperCase().replace(/[\.,;:\(\)]/g, ''));
        return words.map(w => w.toUpperCase())
        .every(w => descWords.some(w2 => w2 === w || w2.match(/X\d+/) && w2.substring(1) === w || w.length > 2 && w2.includes(w)));
    });
}

function getServers(input){
    const r = /^([a-zA-Z]+)(\d+)$/;
    const match = r.exec(input);

    if (match){
        const [name, idx] = [match[1], match[2]];
        const resolved = QuestData.serverNames.filter(s => s.toUpperCase().startsWith(name.toUpperCase()));
        return resolved.map((v, d) => v + idx);
    }
    return [];
}

function getActiveMissions(guild){
    return lists.get(guild.id) || [];
}

function addMission(guild, mission){
    const missions = getActiveMissions(guild);
    if (missions.length <= 10){
        missions.push(mission);
        lists.set(guild.id, missions);
        return true;
    }
    return false;
}

function setMission(guild, index, mission){
    const missions = getActiveMissions(guild);
    if (index >= 0 && index < missions.length){
        missions[index] = mission;
        lists.set(guild.id, missions);
        return true;
    }
    return false;
}

function removeMission(guild, index){
    const missions = getActiveMissions(guild);
    if (index >= 0 && index < missions.length){
        const r = missions.splice(idx - 1, 1);
        lists.set(guild.id, missions);
        return true;
    }
    return false;
}

function getChannel(guild, settings) {
    if (!settings.questChannel) return undefined;
    return guild.channels.find(v => v.type == `text` && v.id == rChan.exec(settings.questChannel)[1]);
}

function updateChannel(ctx, update){
    const result = rChan.exec(update);
    if (!result) return undefined;
    const ch = ctx.guild.channels.find(c => c.id == result[1] && c.type == `text`);
    if (ch){
      const old = getChannel(ctx.guild, ctx.settings);
      // Delete the old message
      if (old && messages.has(ctx.guild.id)){
        old.fetchMessage(messages.get(id))
        .then(msg => msg.delete().catch(() => {}))
        .catch(() => {});
      }
      ctx.settings.questChannel = `<#${ch.id}>`;
      ctx.self.settings.set(ctx.guild.id, ctx.settings);
      return ctx.settings.questChannel;
    }
    return undefined;
}

// Delete the message so that it will be reposted on the next update
function triggerRepost(ctx){
    const settings = ctx.settings;
    if (!settings.questChannel) return;
    const channel = getChannel(ctx.guild, settings);
    if (!channel || !messages.has(ctx.guild.id)) return;
    channel.fetchMessage(messages.get(ctx.guild.id)).then(msg => msg.delete()).catch(() => {});
}

function extension(client){
    let curr = moment();

    function formatMissions(guild){
        const missions = getActiveMissions(guild);
        let msg = ``;
    
        missions.forEach((v, idx) => {
            msg += `<${idx + 1}> **[${v.server}]** ${v.description} --- Time left: ${format.interval(moment.duration(v.end.diff(curr)))}.\n`;
        });
        return msg;
    }

    let embed = format.embed()
    .setTitle('Current Missions')
    .setDescription('///')
    .setTimestamp();

    async function update() {
        curr = moment();
        for (var [id, quests] of lists.entries()) {
            const guild = client.guilds.find(g => g.id === id);
            if (!guild){
                lists.delete(id);
                continue;
            }
            const settings = client.getSettings(guild);
            if (!settings.questChannel) continue;
            const channel = getChannel(guild, settings);
            if (!channel) continue;

            let [valid, expired] = [[], []];

            quests.forEach(v => (curr > v.end ? expired : valid).push(v));
            expired.forEach(v => channel.send(`Mission expired: **[${v.server}]** ${v.description}`));
            quests = valid;

            const pin = settings.pinQuests;

            const send = async () => {
                const msg = await channel.send(embed);
                messages.set(id, msg.id);
                return msg;
            }

            if (quests.length > 0){
                lists.set(id, quests);
                embed.setDescription(formatMissions(guild));
                if (!messages.has(id)){
                    await send();
                }else{
                    // If message not existing, send.
                    const msg = await channel.fetchMessage(messages.get(id))
                        .catch(async () => await send());
    
                    // Message might be deleted in between fetch and processing. 
                    // Simply consume the error in that case, message will be re-send in next tick.
                    // Embed has been deleted, repost.
                    if (msg.embeds.length == 0){
                            msg.delete().catch(() => {});
                            await send();
                    } else {
                        if (pin && !msg.pinned)  msg.pin().catch(() => {});
                        else if (!pin && msg.pinned)  msg.unpin().catch(() => {});
                        msg.edit(embed).catch(() => {});
                    }
                }
            }else{
                lists.delete(id);
                channel.fetchMessage(messages.get(id)).then(msg => msg.delete()).catch(() => {});
            }
          }
          client.setTimeout(update, interval);
    }

    client.on("ready", () => client.setTimeout(update, interval));
}

module.exports = {
    extension: extension,
    getMissions: getMissions,
    getServers: getServers,
    getActiveMissions: getActiveMissions,
    addMission: addMission,
    setMission: setMission,
    removeMission: removeMission,
    updateChannel: updateChannel,
    triggerRepost: triggerRepost,
}
