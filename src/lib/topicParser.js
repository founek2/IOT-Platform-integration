module.exports = function topicParser(stringTemplate, fn) {
    const regex = new RegExp(stringTemplate.replace(/\/\+(?=\/)/g, "/([^/]+)"));

    return (topic, message) => {
        const match = topic.match(regex);
        //console.log("matching topic=" + topic, "by regex=" + regex, "result=" + match);
        if (!match) return;

        const [wholeMatch, ...groups] = match;
        fn(topic, message, groups || []);
    };
};
